package com.warehouseos.operator.data.repository

import android.net.Uri
import com.warehouseos.operator.data.local.PendingPhotoDao
import com.warehouseos.operator.data.local.PendingPhotoEntity
import com.warehouseos.operator.data.local.PhotoStatus
import com.warehouseos.operator.data.photo.PhotoStore
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.safeApiCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The slice of the photo queue the outbox depends on.
 *
 * Same reasoning as [com.warehouseos.operator.data.sync.SyncRequester]: the
 * outbox needs to drop a discarded operation's photos, but must not drag Android
 * file/Context APIs into its own unit tests.
 */
interface PhotoQueue {
    suspend fun discardFor(clientRequestId: String)
}

/**
 * Offline queue for worker photos.
 *
 * Same shape as the operation outbox — capture locally, upload later — with one
 * extra ordering rule: the server rejects a photo whose operation hasn't synced
 * yet, so the DAO only hands back photos whose operation already left the outbox.
 *
 * Uploads are Wi-Fi-only (see PhotoUploadScheduler): ~200 KB per photo across a
 * full shift is real money on a worker's SIM.
 */
@Singleton
class PhotoRepository @Inject constructor(
    private val dao: PendingPhotoDao,
    private val api: ApiService,
    private val store: PhotoStore,
) : PhotoQueue {
    /** Drives the «N عکس در انتظار ارسال» badge. */
    val pendingCount: Flow<Int> = dao.pendingCount()

    val failed: Flow<List<PendingPhotoEntity>> = dao.failed()

    /**
     * Compresses [source] and queues it against an already-enqueued operation.
     * Returns false when the image can't be read — the caller shows "photo not
     * saved" and moves on; a missing photo must never block the stock-in flow.
     */
    suspend fun attach(clientRequestId: String, source: Uri): Boolean =
        withContext(Dispatchers.IO) {
            val compressed = store.compress(source) ?: return@withContext false
            dao.insert(
                PendingPhotoEntity(
                    id = UUID.randomUUID().toString(),
                    clientRequestId = clientRequestId,
                    filePath = compressed.absolutePath,
                    bytes = compressed.length(),
                    status = PhotoStatus.PENDING,
                ),
            )
            true
        }

    /**
     * Uploads every photo whose operation is on the server.
     *
     * Returns true when nothing is left to retry. False means "try again later"
     * — never "give up": like the outbox, a 401 or a not-yet-synced operation
     * keeps the row PENDING rather than losing the worker's photo.
     */
    suspend fun sync(): Boolean = withContext(Dispatchers.IO) {
        val rows = dao.getReadyToUpload()
        if (rows.isEmpty()) return@withContext true

        var allTerminal = true
        for (row in rows) {
            val file = File(row.filePath)
            if (!file.exists()) {
                // Nothing left to send (cache cleared, or a failed write). Drop the
                // row instead of retrying a file that will never come back.
                dao.delete(row.id)
                continue
            }

            val part = MultipartBody.Part.createFormData(
                "file",
                file.name,
                file.asRequestBody(JPEG.toMediaType()),
            )

            when (val result = safeApiCall { api.uploadOperationPhoto(row.clientRequestId, part) }) {
                is ApiResult.Success -> {
                    // Stored server-side — reclaim the space on the worker's phone.
                    store.delete(row.filePath)
                    dao.delete(row.id)
                }

                // Server unreachable — keep it queued for the next Wi-Fi window.
                is ApiResult.NetworkError -> allTerminal = false

                // Token expired mid-drain. Same rule as the outbox: stay PENDING so
                // a refreshed token retries. Marking FAILED here would silently
                // discard photos once a day, right when the session rolls over.
                ApiResult.Unauthorized -> allTerminal = false

                is ApiResult.ServerError -> {
                    if (result.code == HTTP_NOT_FOUND) {
                        // The operation hasn't landed yet — the DAO filter normally
                        // prevents this, but a concurrent outbox drain can race it.
                        allTerminal = false
                    } else {
                        // A real rejection (bad format, too large). Surface it to the
                        // worker rather than retrying forever.
                        dao.updateStatus(
                            row.id,
                            PhotoStatus.FAILED,
                            row.attemptCount + 1,
                            result.message,
                        )
                    }
                }
            }
        }
        allTerminal
    }

    /** Manual retry of a photo the server rejected. */
    suspend fun retry(id: String) = dao.retry(id)

    /** Drops a queued photo and its file (worker discarded the operation). */
    override suspend fun discardFor(clientRequestId: String) = withContext(Dispatchers.IO) {
        dao.forOperation(clientRequestId).forEach { store.delete(it.filePath) }
        dao.deleteForOperation(clientRequestId)
    }

    private companion object {
        const val JPEG = "image/jpeg"
        const val HTTP_NOT_FOUND = 404
    }
}
