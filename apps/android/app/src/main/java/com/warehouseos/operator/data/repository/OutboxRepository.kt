package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.local.OutboxDao
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxStatus
import com.warehouseos.operator.data.local.OutboxType
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.remote.dto.SyncOperationRequest
import com.warehouseos.operator.data.remote.dto.SyncOperationsRequest
import com.warehouseos.operator.data.remote.dto.WorkTaskSyncMutationRequest
import com.warehouseos.operator.data.remote.dto.WorkTaskSyncRequest
import com.warehouseos.operator.data.remote.dto.WorkTaskTickPayload
import com.warehouseos.operator.data.remote.safeApiCall
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
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
    private val photos: PhotoQueue,
) {
    /** Drives the "N pending" badge. */
    val unsyncedCount: Flow<Int> = dao.unsyncedCount()

    val failed: Flow<List<OutboxEntity>> = dao.failed()

    /**
     * Local-first write — returns immediately; sync happens in the background.
     *
     * Returns the generated `clientRequestId` so the caller can hang a photo off
     * the same operation: it is the idempotency key the photo upload is keyed on.
     */
    suspend fun enqueue(
        type: String,
        locationBarcode: String,
        voiceText: String?,
        productId: String?,
        quantity: Int,
        unit: String?,
    ): String {
        val clientRequestId = UUID.randomUUID().toString()
        dao.insert(
            OutboxEntity(
                clientRequestId = clientRequestId,
                type = type,
                locationBarcode = locationBarcode,
                voiceText = voiceText,
                productId = productId,
                quantity = quantity,
                unit = unit,
                status = OutboxStatus.PENDING,
            ),
        )
        return clientRequestId
    }

    /**
     * Offline new-product request: the full CreateProductRequestBody is stored as
     * JSON in [OutboxEntity.payload], synced to POST /product-requests later.
     */
    suspend fun enqueueProductRequest(body: CreateProductRequestBody) {
        dao.insert(
            OutboxEntity(
                clientRequestId = UUID.randomUUID().toString(),
                type = OutboxType.NEW_PRODUCT_REQUEST,
                locationBarcode = body.locationBarcode.orEmpty(),
                voiceText = body.voiceText,
                productId = null,
                quantity = body.quantity,
                unit = body.unit,
                status = OutboxStatus.PENDING,
                payload = Json.encodeToString(CreateProductRequestBody.serializer(), body),
            ),
        )
    }

    /**
     * تیکِ یک قلمِ «کار انبار» — local-first. ردیف با نوع WORK_TASK_TICK در صف
     * می‌نشیند و sync شبانه آن را به POST /work-tasks/sync می‌برد. [clientRequestId]
     * همان clientMutationId سمت سرور است؛ تکرارِ sync هرگز یک تیک را دوبار نمی‌زند.
     */
    suspend fun enqueueWorkTaskTick(taskId: String, itemId: String) {
        dao.insert(
            OutboxEntity(
                clientRequestId = UUID.randomUUID().toString(),
                type = OutboxType.WORK_TASK_TICK,
                locationBarcode = "",
                voiceText = null,
                productId = null,
                quantity = 0,
                unit = null,
                status = OutboxStatus.PENDING,
                payload = Json.encodeToString(
                    WorkTaskTickPayload.serializer(),
                    WorkTaskTickPayload(taskId = taskId, itemId = itemId),
                ),
            ),
        )
    }

    /**
     * Drains all syncable (PENDING) rows. Returns true when every row reached a
     * terminal state (SYNCED or rejected → FAILED); false only when the network
     * blocked progress, so the worker's retry means "try again later" — never
     * "re-send something the server already rejected".
     *
     * New-product requests go to POST /product-requests; stock ops go to the
     * batch POST /sync/operations; work-task ticks go to POST /work-tasks/sync.
     * A failure in one kind doesn't block the other.
     */
    suspend fun sync(): Boolean {
        val ops = dao.getSyncable()
        if (ops.isEmpty()) return true

        val ticks = ops.filter { it.type == OutboxType.WORK_TASK_TICK }
        val productRequests = ops.filter { it.type == OutboxType.NEW_PRODUCT_REQUEST }
        val stockOps = ops.filter { it.type != OutboxType.WORK_TASK_TICK && it.type != OutboxType.NEW_PRODUCT_REQUEST }

        var allTerminal = true

        if (stockOps.isNotEmpty()) {
            allTerminal = syncStockOps(stockOps) && allTerminal
        }
        if (ticks.isNotEmpty()) {
            allTerminal = syncTicks(ticks) && allTerminal
        }

        for (op in productRequests) {
            allTerminal = syncProductRequest(op) && allTerminal
        }

        return allTerminal
    }

    /** Manual retry of a row the server rejected (FAILED → PENDING). */
    suspend fun retry(clientRequestId: String) {
        dao.retry(clientRequestId)
    }

    /**
     * Discard a row the worker no longer wants to send (e.g. wrong shelf scan).
     *
     * Any photo captured for it goes too: the server keys photos on this same
     * clientRequestId, so once the operation is gone its photo can never be
     * accepted — leaving it queued would retry forever and hold disk space.
     *
     * Returns false when the row was already synced and cleared — the operation
     * is on the server and only a manager can reverse it now, so the caller must
     * not tell the worker it was undone.
     */
    suspend fun discard(clientRequestId: String): Boolean {
        val removed = dao.delete(clientRequestId) > 0
        photos.discardFor(clientRequestId)
        return removed
    }

    private suspend fun syncStockOps(ops: List<OutboxEntity>): Boolean {
        val request = SyncOperationsRequest(ops.map { it.toRequest() })

        return when (val result = safeApiCall { api.syncOperations(request) }) {
            is ApiResult.Success -> {
                ops.forEach { dao.updateStatus(it.clientRequestId, OutboxStatus.SYNCED, it.attemptCount, null) }
                dao.clearSynced()
                true
            }
            // Server can't be reached (offline / not near the LAN server) — keep
            // PENDING and let WorkManager retry when connectivity returns.
            is ApiResult.NetworkError -> false
            // A 401 is NOT a rejection of the operation — it means the token
            // expired (e.g. offline past the sliding-refresh window). The captured
            // work is valid; losing it would be data loss. Keep it PENDING and
            // retry: the next request refreshes the token (or the worker re-logs
            // in), and the same rows sync cleanly. clientRequestId keeps the
            // eventual replay idempotent.
            ApiResult.Unauthorized -> false
            is ApiResult.ServerError -> {
                ops.forEach { dao.updateStatus(it.clientRequestId, OutboxStatus.FAILED, it.attemptCount + 1, result.message) }
                true
            }
        }
    }

    /**
     * تیک‌های آفلاین را به صورت batch به POST /work-tasks/sync می‌فرستد.
     *
     * پاسخ هر قلم مستقل است: OK/ALREADY_DONE یعنی سرور قلم را DONE می‌داند →
     * ردیف SYNCED و پاک می‌شود. ردهای قطعی (کار لغو/بدون‌دسترسی/قلم نبود) →
     * FAILED با پیام فارسی تا کارگر در «ردشده‌ها» ببیند. قطعی شبکه → PENDING می‌ماند.
     */
    private suspend fun syncTicks(ops: List<OutboxEntity>): Boolean {
        val mutations = ops.mapNotNull { op ->
            val payload = runCatching {
                Json.decodeFromString(WorkTaskTickPayload.serializer(), op.payload ?: "")
            }.getOrNull()
            if (payload == null) {
                // payload خراب — علامت FAILED بزن و رد شو.
                dao.updateStatus(op.clientRequestId, OutboxStatus.FAILED, op.attemptCount + 1, "bad payload")
                null
            } else {
                WorkTaskSyncMutationRequest(
                    clientMutationId = op.clientRequestId,
                    taskId = payload.taskId,
                    itemId = payload.itemId,
                )
            }
        }
        if (mutations.isEmpty()) return true

        return when (val result = safeApiCall { api.syncWorkTaskMutations(WorkTaskSyncRequest(mutations)) }) {
            is ApiResult.Success -> {
                val byId = result.data.results.associateBy { it.clientMutationId }
                ops.forEach { op ->
                    val status = byId[op.clientRequestId]?.status
                    when (status) {
                        "OK", "ALREADY_DONE" ->
                            dao.updateStatus(op.clientRequestId, OutboxStatus.SYNCED, op.attemptCount, null)
                        else ->
                            dao.updateStatus(
                                op.clientRequestId,
                                OutboxStatus.FAILED,
                                op.attemptCount + 1,
                                status.failMessage() ?: "پاسخی از سرور نیامد",
                            )
                    }
                }
                dao.clearSynced()
                true
            }
            // قطعی شبکه — تیک‌ها PENDING می‌مانند تا اتصال بعدی.
            is ApiResult.NetworkError -> false
            // 401 = توکن منقضی، ردِ عملیات نیست — PENDING بماند تا توکن تازه شود.
            ApiResult.Unauthorized -> false
            is ApiResult.ServerError -> {
                ops.forEach {
                    dao.updateStatus(it.clientRequestId, OutboxStatus.FAILED, it.attemptCount + 1, result.message)
                }
                true
            }
        }
    }

    private fun String?.failMessage(): String? = when (this) {
        "TASK_CANCELLED" -> "کار لغو شده است"
        "TASK_NOT_VISIBLE" -> "این کار به شما تخصیص داده نشده"
        "ITEM_NOT_FOUND" -> "قلم در کار پیدا نشد"
        else -> null
    }

    private suspend fun syncProductRequest(op: OutboxEntity): Boolean {
        val body = runCatching {
            Json.decodeFromString(CreateProductRequestBody.serializer(), op.payload ?: "")
        }.getOrNull() ?: run {
            // payload خراب — نمی‌شود بفرستیم؛ علامت FAILED بزن و رد شو.
            dao.updateStatus(op.clientRequestId, OutboxStatus.FAILED, op.attemptCount + 1, "bad payload")
            return true
        }

        return when (val result = safeApiCall { api.createProductRequest(body) }) {
            is ApiResult.Success -> {
                dao.updateStatus(op.clientRequestId, OutboxStatus.SYNCED, op.attemptCount, null)
                dao.clearSynced()
                true
            }
            is ApiResult.NetworkError -> false
            // 401 = expired token, not a rejection. Keep PENDING and retry after
            // the token refreshes (same reasoning as the stock-ops path above);
            // only a real server answer (4xx/5xx) is terminal FAILED.
            ApiResult.Unauthorized -> false
            is ApiResult.ServerError -> {
                dao.updateStatus(op.clientRequestId, OutboxStatus.FAILED, op.attemptCount + 1, result.message)
                true
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
