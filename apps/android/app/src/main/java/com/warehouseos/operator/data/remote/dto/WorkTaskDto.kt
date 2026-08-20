package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /work-tasks/mine — صف «کارهای انبار» همین کارگر.
 *
 * یک Task چندقلمی است که فروشنده/مدیر از POS می‌فرستد (اختیاراً به یک فاکتور/
 * پیش‌فاکتور وصل است). کارگر قلم‌ها را یکی‌یکی تیک می‌زند؛ [doneItems]/[totalItems]
 * از سمت سرور می‌آید و POS پیشرفت زنده را نشان می‌دهد.
 *
 * عمداً **هیچ تماسی با موجودی ندارد** — تیک فقط یک ادعا است؛ کسر واقعی هنگام
 * ثبت فاکتور روی ویندوز انجام می‌شود.
 */
@Serializable
data class WorkTaskDto(
    val id: String,
    /** PENDING | IN_PROGRESS | COMPLETED | CANCELLED */
    val status: String = "PENDING",
    val invoiceId: String? = null,
    val quotationId: String? = null,
    val assignedToId: String? = null,
    val note: String? = null,
    val doneItems: Int = 0,
    val totalItems: Int = 0,
    val invoice: WorkTaskRefDto? = null,
    val quotation: WorkTaskRefDto? = null,
    val requestedBy: WorkTaskPersonDto? = null,
    val assignedTo: WorkTaskPersonDto? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    /** فقط در GET /work-tasks/{id} پر می‌شود. */
    val items: List<WorkTaskItemDto>? = null,
)

@Serializable
data class WorkTaskItemDto(
    val id: String,
    val taskId: String,
    /** PENDING | DONE */
    val status: String = "PENDING",
    val productId: String? = null,
    val quantity: Int = 1,
    val product: WorkTaskProductDto? = null,
    val location: WorkTaskLocationDto? = null,
    val doneBy: WorkTaskPersonDto? = null,
)

@Serializable
data class WorkTaskProductDto(
    val id: String,
    val name: String = "",
    val sku: String? = null,
    val unit: String? = null,
)

@Serializable
data class WorkTaskLocationDto(
    val id: String,
    val name: String = "",
    val code: String = "",
    val barcode: String? = null,
    /** آدرسِ خواندنیِ قفسه — کارگر باید همین را ببیند. */
    val path: String? = null,
)

@Serializable
data class WorkTaskRefDto(
    val number: String? = null,
)

@Serializable
data class WorkTaskPersonDto(
    val id: String,
    val fullName: String? = null,
)

/** یک تیک آفلاین — payload ردیف outbox با نوع WORK_TASK_TICK. */
@Serializable
data class WorkTaskTickPayload(
    val taskId: String,
    val itemId: String,
)

@Serializable
data class WorkTaskSyncMutationRequest(
    val clientMutationId: String,
    val taskId: String,
    val itemId: String,
)

@Serializable
data class WorkTaskSyncRequest(
    val mutations: List<WorkTaskSyncMutationRequest>,
)

@Serializable
data class WorkTaskSyncResultItem(
    val clientMutationId: String,
    val taskId: String = "",
    val itemId: String = "",
    /** OK | ALREADY_DONE | TASK_CANCELLED | TASK_NOT_VISIBLE | ITEM_NOT_FOUND */
    val status: String = "",
)

@Serializable
data class WorkTaskSyncResponse(
    val results: List<WorkTaskSyncResultItem> = emptyList(),
)
