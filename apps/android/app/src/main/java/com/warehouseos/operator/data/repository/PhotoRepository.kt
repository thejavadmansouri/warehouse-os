package com.warehouseos.operator.data.repository

import android.net.Uri
import com.warehouseos.operator.data.local.PendingPhotoDao
import com.warehouseos.operator.data.local.PendingPhotoEntity
import com.warehouseos.operator.data.local.PhotoStatus
import com.warehouseos.operator.data.photo.PhotoStore
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.sync.PhotoUploadRequester
import com.warehouseos.operator.data.remote.safeApiCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
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

    /** عملیات از سرور رد شد — عکسش هم باید رد شود، نه اینکه بی‌صدا در صف بماند. */
    suspend fun failFor(clientRequestId: String, reason: String)

    /** عملیات دوباره تلاش می‌شود — عکسش هم به صف برمی‌گردد. */
    suspend fun requeueFor(clientRequestId: String)
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
    private val uploads: PhotoUploadRequester,
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
            queueCompressed(clientRequestId, compressed)
        }

    /**
     * صف کردن فایلی که از قبل روی دستگاه فشرده شده (مسیر تأیید صوت را سبک نگه می‌دارد).
     */
    suspend fun attachReady(clientRequestId: String, compressed: File): Boolean =
        withContext(Dispatchers.IO) {
            if (!compressed.exists() || compressed.length() == 0L) return@withContext false
            queueCompressed(clientRequestId, compressed)
        }

    /**
     * صف عکسِ چیدن — فایل از قبل فشرده است (مثل [attachReady]).
     * پیشوند `wti:` یعنی بدون PendingOperation هم آماده‌ی آپلود است.
     */
    suspend fun attachReadyForWorkTaskItem(itemId: String, compressed: File): Boolean =
        withContext(Dispatchers.IO) {
            if (!compressed.exists() || compressed.length() == 0L) return@withContext false
            queueCompressed(workTaskItemKey(itemId), compressed)
        }

    private fun workTaskItemKey(itemId: String): String =
        "wti:$itemId:${UUID.randomUUID()}"

    private suspend fun queueCompressed(clientRequestId: String, compressed: File): Boolean {
        dao.insert(
            PendingPhotoEntity(
                id = UUID.randomUUID().toString(),
                clientRequestId = clientRequestId,
                filePath = compressed.absolutePath,
                bytes = compressed.length(),
                status = PhotoStatus.PENDING,
            ),
        )

        /*
         * همین‌جا درخواستِ ارسال بده.
         *
         * تا امروز گرفتنِ عکس هیچ‌چیزی را زمان‌بندی نمی‌کرد: تنها محرک‌ها
         * پایانِ موفقِ drainِ outbox بود و کارِ دوره‌ایِ ۳۰ دقیقه‌ای. پس عکسی
         * که برای عملیاتی گرفته می‌شد که **از قبل** سینک شده بود، تا نیم
         * ساعت در «انتظار» می‌ماند بی‌آنکه چیزی اشتباه باشد.
         *
         * اگر عملیاتش هنوز نرفته باشد، این اجرا کاری نمی‌کند و بی‌ضرر است —
         * فیلترِ DAO عکس را برنمی‌گرداند.
         */
        uploads.requestUpload()
        return true
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

        val gate = Semaphore(UPLOAD_CONCURRENCY)
        coroutineScope {
            rows.map { row ->
                async {
                    gate.withPermit { uploadOne(row) }
                }
            }.awaitAll().all { it }
        }
    }

    /** true = terminal for this row; false = retry later. */
    private suspend fun uploadOne(row: PendingPhotoEntity): Boolean {
        val file = File(row.filePath)
        if (!file.exists()) {
            dao.delete(row.id)
            return true
        }

        val part = MultipartBody.Part.createFormData(
            "file",
            file.name,
            file.asRequestBody(JPEG.toMediaType()),
        )

        val upload = if (row.clientRequestId.startsWith(WTI_PREFIX)) {
            val itemId = row.clientRequestId.removePrefix(WTI_PREFIX).substringBefore(':')
            safeApiCall { api.uploadWorkTaskItemPhoto(itemId, part) }
        } else {
            safeApiCall { api.uploadOperationPhoto(row.clientRequestId, part) }
        }

        return when (upload) {
            is ApiResult.Success -> {
                store.delete(row.filePath)
                dao.delete(row.id)
                true
            }

            is ApiResult.NetworkError -> false
            ApiResult.Unauthorized -> false

            is ApiResult.ServerError -> {
                if (resultIsRetryableNotFound(upload, row)) {
                    false
                } else {
                    dao.updateStatus(
                        row.id,
                        PhotoStatus.FAILED,
                        row.attemptCount + 1,
                        upload.message,
                    )
                    true
                }
            }
        }
    }

    /** ۴۰۴ عملیات ورود = هنوز sync نشده؛ برای wti همیشه خطای قطعی است. */
    private fun resultIsRetryableNotFound(
        result: ApiResult.ServerError,
        row: PendingPhotoEntity,
    ): Boolean =
        result.code == HTTP_NOT_FOUND && !row.clientRequestId.startsWith(WTI_PREFIX)

    /** Manual retry of a photo the server rejected. */
    suspend fun retry(id: String) = dao.retry(id)

    /**
     * عملیات از سرور رد شد ⇒ عکسش هیچ‌وقت پذیرفته نمی‌شود.
     *
     * سرور عکس را روی `clientRequestId` همان عملیات می‌گیرد؛ وقتی عملیاتی ثبت
     * نشده، آپلود همیشه ۴۰۴ می‌گیرد. پس به‌جای انتظارِ بی‌پایان، همان‌جا رد
     * می‌شود تا کارگر در فهرستِ ردشده‌ها ببیندش.
     */
    override suspend fun failFor(clientRequestId: String, reason: String) =
        dao.failForOperation(clientRequestId, reason)

    /** با تلاشِ دوباره‌ی عملیات، عکسش هم به صف برمی‌گردد. */
    override suspend fun requeueFor(clientRequestId: String) =
        dao.requeueForOperation(clientRequestId)

    /** Drops a queued photo and its file (worker discarded the operation). */
    override suspend fun discardFor(clientRequestId: String) = withContext(Dispatchers.IO) {
        dao.forOperation(clientRequestId).forEach { store.delete(it.filePath) }
        dao.deleteForOperation(clientRequestId)
    }

    private companion object {
        const val JPEG = "image/jpeg"
        const val HTTP_NOT_FOUND = 404
        const val WTI_PREFIX = "wti:"
        /** چند آپلود همزمان روی Wi‑Fi پایان شیفت را سریع‌تر خالی می‌کند. */
        const val UPLOAD_CONCURRENCY = 3
    }
}
