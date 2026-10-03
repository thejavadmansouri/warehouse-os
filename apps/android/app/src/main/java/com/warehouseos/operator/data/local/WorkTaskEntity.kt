package com.warehouseos.operator.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cache محلیِ «کارهای انبار» (WorkTask) که از GET /work-tasks/mine می‌آید.
 *
 * ردیف‌ها فقط برای نمایش آفلاین و پیشرفتِ زنده‌ی محلی هستند — منبعِ حقیقت سرور
 * است. هر تیکِ کارگر در [OutboxEntity] با نوع WORK_TASK_TICK می‌نشیند و sync
 * شبانه آن را به POST /work-tasks/sync می‌برد. این جدول هیچ ربطی به موجودی ندارد.
 */
@Entity(tableName = "work_task")
data class WorkTaskEntity(
    @PrimaryKey val id: String,
    /** PENDING | IN_PROGRESS | COMPLETED | CANCELLED */
    val status: String,
    /** PICK | PUTAWAY — جهتِ کار. رفتنِ سراغِ قفسه در هر دو یکی است، مقصد فرق دارد. */
    val kind: String,
    val invoiceNumber: String?,
    val quotationNumber: String?,
    val note: String?,
    val requestedByName: String?,
    val assignedToName: String?,
    val doneItems: Int,
    val totalItems: Int,
    val createdAt: Long,
    val updatedAt: Long,
)

/** یک قلم از کار — با موقعیت قفسه تا کارگر بدون اسکن پیدایش کند. */
@Entity(tableName = "work_task_item")
data class WorkTaskItemEntity(
    @PrimaryKey val id: String,
    val taskId: String,
    /** ترتیبِ نمایشِ قلم‌ها از سرور حفظ می‌شود. */
    val position: Int,
    /** PENDING | DONE */
    val status: String,
    val productName: String,
    val productSku: String?,
    val unit: String?,
    val quantity: Int,
    val locationName: String?,
    val locationBarcode: String?,
    val locationPath: String?,
    val doneById: String?,
)
