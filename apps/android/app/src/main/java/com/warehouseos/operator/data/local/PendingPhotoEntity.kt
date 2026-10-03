package com.warehouseos.operator.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One captured photo waiting to be uploaded, keyed to the operation it documents.
 *
 * [clientRequestId] is the SAME idempotency key as the [OutboxEntity] row, which
 * is also what the server keys the upload on — so a replayed upload attaches to
 * the same operation instead of creating a second asset.
 *
 * There is no SYNCED status on purpose: a successful upload deletes both the row
 * and the file, so the queue never accumulates dead weight on the worker's phone.
 */
@Entity(
    tableName = "pending_photo",
    indices = [Index("clientRequestId")],
)
data class PendingPhotoEntity(
    @PrimaryKey val id: String,
    val clientRequestId: String,
    /** Absolute path of the compressed JPEG in app-private storage. */
    val filePath: String,
    val bytes: Long,
    val status: String, // PENDING | FAILED
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

object PhotoStatus {
    const val PENDING = "PENDING"
    const val FAILED = "FAILED"
}
