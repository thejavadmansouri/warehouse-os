package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.local.OutboxDao
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxStatus
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.SyncOperationRequest
import com.warehouseos.operator.data.remote.dto.SyncOperationsRequest
import com.warehouseos.operator.data.remote.safeApiCall
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The offline outbox (Epic 8). Captured operations are written here FIRST
 * (local-first), then drained to the server by the sync worker when the LAN
 * server is reachable. The UI reads local state, never a network response.
 */
@Singleton
class OutboxRepository @Inject constructor(
    private val dao: OutboxDao,
    private val api: ApiService,
) {
    /** Drives the "N pending" badge. */
    val unsyncedCount: Flow<Int> = dao.unsyncedCount()

    val failed: Flow<List<OutboxEntity>> = dao.failed()

    /** Local-first write — returns immediately; sync happens in the background. */
    suspend fun enqueue(
        type: String,
        locationBarcode: String,
        voiceText: String?,
        productId: String?,
        quantity: Int,
        unit: String?,
    ) {
        dao.insert(
            OutboxEntity(
                clientRequestId = UUID.randomUUID().toString(),
                type = type,
                locationBarcode = locationBarcode,
                voiceText = voiceText,
                productId = productId,
                quantity = quantity,
                unit = unit,
                status = OutboxStatus.PENDING,
            ),
        )
    }

    /**
     * Uploads all syncable rows in one batch. Returns true if the batch reached
     * the server (marked SYNCED); false if the network is unavailable (stays
     * PENDING for the next attempt). A server-side rejection marks rows FAILED.
     */
    suspend fun sync(): Boolean {
        val ops = dao.getSyncable()
        if (ops.isEmpty()) return true

        val request = SyncOperationsRequest(ops.map { it.toRequest() })

        return when (val result = safeApiCall { api.syncOperations(request) }) {
            is ApiResult.Success -> {
                ops.forEach { dao.updateStatus(it.clientRequestId, OutboxStatus.SYNCED, it.attemptCount, null) }
                dao.clearSynced()
                true
            }
            // Server can't be reached (offline / not "close to the server") — keep
            // PENDING and let WorkManager retry when connectivity returns.
            is ApiResult.NetworkError -> false
            ApiResult.Unauthorized -> {
                ops.forEach { dao.updateStatus(it.clientRequestId, OutboxStatus.FAILED, it.attemptCount + 1, "unauthorized") }
                false
            }
            is ApiResult.ServerError -> {
                ops.forEach { dao.updateStatus(it.clientRequestId, OutboxStatus.FAILED, it.attemptCount + 1, result.message) }
                false
            }
        }
    }

    private fun OutboxEntity.toRequest() = SyncOperationRequest(
        clientRequestId = clientRequestId,
        type = type,
        locationBarcode = locationBarcode,
        voiceText = voiceText,
        quantity = quantity,
        unit = unit,
        productId = productId,
    )
}
