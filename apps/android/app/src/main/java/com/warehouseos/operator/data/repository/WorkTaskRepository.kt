package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.local.WorkTaskDao
import com.warehouseos.operator.data.local.WorkTaskEntity
import com.warehouseos.operator.data.local.WorkTaskItemEntity
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.WorkTaskDto
import com.warehouseos.operator.data.remote.dto.WorkTaskItemDto
import com.warehouseos.operator.data.remote.safeApiCall
import kotlinx.coroutines.flow.Flow
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * «کارهای انبار» — همان WorkTask بک‌اند. صف از سرور می‌آید و در Room کش می‌شود
 * تا کارگر وسط روزِ آفلاین هم کارها و پیشرفت را ببیند.
 *
 * تیک = local-first: اول قلم محلی DONE می‌شود (خوش‌بینانه) و هم‌زمان ردیف
 * WORK_TASK_TICK در outbox می‌نشیند. وقتی کارگر دوباره به وای‌فای مغازه رسید،
 * sync شبانه تیک‌ها را به POST /work-tasks/sync می‌برد و POS پیشرفت زنده می‌گیرد.
 * موجودی هیچ‌جا دست نمی‌خورد — این فقط یک تابلوی کار است.
 */
@Singleton
class WorkTaskRepository @Inject constructor(
    private val api: ApiService,
    private val taskDao: WorkTaskDao,
    private val outbox: OutboxRepository,
) {
    /** صفِ کارهای همین کارگر (تخصیصی + بدون‌تخصیص)، جدیدترین اول. */
    val tasks: Flow<List<WorkTaskEntity>> = taskDao.observeAll()

    fun observeTask(taskId: String): Flow<WorkTaskEntity?> = taskDao.observeTask(taskId)

    fun observeItems(taskId: String): Flow<List<WorkTaskItemEntity>> = taskDao.observeItems(taskId)

    /**
     * بازنشانی صف محلی از سرور. فقط بعد از موفقیتِ fetch، کش قبلی پاک می‌شود —
     * آفلاین یعنی همان چیزی که آخرین بار دیده شده می‌ماند.
     */
    suspend fun refresh(): ApiResult<Unit> {
        val result = safeApiCall { api.workTasksMine() }
        if (result is ApiResult.Success) {
            return runCatching {
                taskDao.clearAll()
                taskDao.upsertTasks(result.data.map { it.toEntity() })
            }.fold(
                onSuccess = { ApiResult.Success(Unit) },
                onFailure = { ApiResult.NetworkError(it) },
            )
        }
        return result.mapUnit()
    }

    /** قلم‌های یک کار را از جزئیات سرور می‌گیرد و کش می‌کند (برای تیک آفلاین). */
    suspend fun fetchDetail(taskId: String): ApiResult<Unit> {
        val result = safeApiCall { api.workTaskDetail(taskId) }
        if (result is ApiResult.Success) {
            return runCatching {
                taskDao.upsertTasks(listOf(result.data.toEntity()))
                result.data.items?.let { items ->
                    taskDao.upsertItems(items.mapIndexed { index, item -> item.toEntity(taskId, index) })
                }
            }.fold(
                onSuccess = { ApiResult.Success(Unit) },
                onFailure = { ApiResult.NetworkError(it) },
            )
        }
        return result.mapUnit()
    }

    /**
     * تیک خوش‌بینانه: قلم محلی DONE می‌شود + ردیف در outbox می‌نشیند.
     * اگر قلم از قبل DONE بود (تکراری) ردیفی ساخته نمی‌شود.
     */
    suspend fun tick(taskId: String, itemId: String): Boolean {
        val marked = taskDao.markItemDone(taskId, itemId)
        if (marked == 0) return false
        taskDao.bumpTaskProgress(taskId)
        outbox.enqueueWorkTaskTick(taskId, itemId)
        return true
    }

    private fun WorkTaskDto.toEntity() = WorkTaskEntity(
        id = id,
        status = status,
        kind = kind,
        invoiceNumber = invoice?.number,
        quotationNumber = quotation?.number,
        note = note,
        requestedByName = requestedBy?.fullName,
        assignedToName = assignedTo?.fullName,
        doneItems = doneItems,
        totalItems = totalItems,
        createdAt = createdAt.parseEpoch() ?: 0L,
        updatedAt = updatedAt.parseEpoch() ?: System.currentTimeMillis(),
    )

    private fun WorkTaskItemDto.toEntity(taskId: String, position: Int) = WorkTaskItemEntity(
        id = id,
        taskId = taskId,
        position = position,
        status = status,
        productName = product?.name ?: "—",
        productSku = product?.sku,
        unit = product?.unit,
        quantity = quantity,
        locationName = location?.name,
        locationBarcode = location?.barcode,
        locationPath = location?.path,
        doneById = doneBy?.id,
    )

    private fun String?.parseEpoch(): Long? = runCatching {
        Instant.parse(this).toEpochMilli()
    }.getOrNull()
}

/** همان نتیجه، با نوع Unit — برای توابعی که فقط «موفق/ناموفق» برمی‌گردانند. */
private fun <T> ApiResult<T>.mapUnit(): ApiResult<Unit> = when (this) {
    is ApiResult.Success -> ApiResult.Success(Unit)
    is ApiResult.Unauthorized -> ApiResult.Unauthorized
    is ApiResult.NetworkError -> ApiResult.NetworkError(cause)
    is ApiResult.ServerError -> ApiResult.ServerError(code, message)
}
