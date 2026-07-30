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
)

object OutboxStatus {
    const val PENDING = "PENDING"
    const val SYNCED = "SYNCED"
    const val FAILED = "FAILED"
}
