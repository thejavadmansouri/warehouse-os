package com.warehouseos.operator.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One captured inventory operation, stored locally first (Epic 8). The
 * [clientRequestId] is the server idempotency key — a replayed sync can never
 * duplicate. Rows are drained to POST /sync/operations by the sync worker.
 */
@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey val clientRequestId: String,
    val type: String, // "IN" | "COUNT"
    val locationBarcode: String,
    val voiceText: String?,
    val productId: String?,
    val quantity: Int,
    val unit: String?,
    val status: String, // PENDING | SYNCED | FAILED
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    /** JSON payload for types whose body isn't representable in fixed columns (e.g. NEW_PRODUCT_REQUEST). */
    val payload: String? = null,
)

object OutboxStatus {
    const val PENDING = "PENDING"
    const val SYNCED = "SYNCED"
    const val FAILED = "FAILED"
}

object OutboxType {
    const val IN = "IN"
    const val COUNT = "COUNT"
    const val NEW_PRODUCT_REQUEST = "NEW_PRODUCT_REQUEST"
    /** تیک یک قلمِ «کار انبار» — به POST /work-tasks/sync می‌رود، نه /sync/operations. */
    const val WORK_TASK_TICK = "WORK_TASK_TICK"
    /** چسباندن بارکد جعبه به کالا — به POST /barcode/link می‌رود. */
    const val BARCODE_LINK = "BARCODE_LINK"
}
