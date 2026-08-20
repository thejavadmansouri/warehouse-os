package com.warehouseos.operator.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingPhotoDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(photo: PendingPhotoEntity)

    /**
     * Photos whose operation has actually landed on the server.
     *
     * The server rejects a photo whose PendingOperation doesn't exist yet (404),
     * so ordering matters. A synced outbox row is DELETED (`clearSynced`), which
     * makes "no longer in the outbox" the local proof that the operation is on
     * the server — no extra bookkeeping, no wasted 404s. A row still sitting in
     * the outbox (PENDING, or FAILED because the server rejected it) keeps its
     * photo waiting instead of burning attempts.
     */
    @Query(
        """
        SELECT * FROM pending_photo
        WHERE status = 'PENDING'
          AND clientRequestId NOT IN (SELECT clientRequestId FROM outbox)
        ORDER BY createdAt ASC
        """,
    )
    suspend fun getReadyToUpload(): List<PendingPhotoEntity>

    @Query("SELECT * FROM pending_photo WHERE clientRequestId = :operationId")
    suspend fun forOperation(operationId: String): List<PendingPhotoEntity>

    @Query(
        "UPDATE pending_photo SET status = :status, attemptCount = :attempts, lastError = :error WHERE id = :id",
    )
    suspend fun updateStatus(id: String, status: String, attempts: Int, error: String?)

    /** Manual retry of a photo the server rejected (FAILED → PENDING). */
    @Query("UPDATE pending_photo SET status = 'PENDING', attemptCount = 0, lastError = NULL WHERE id = :id")
    suspend fun retry(id: String)

    @Query("DELETE FROM pending_photo WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM pending_photo WHERE clientRequestId = :operationId")
    suspend fun deleteForOperation(operationId: String)

    /** Drives the «N عکس در انتظار ارسال» badge. */
    @Query("SELECT COUNT(*) FROM pending_photo WHERE status IN ('PENDING','FAILED')")
    fun pendingCount(): Flow<Int>

    @Query("SELECT * FROM pending_photo WHERE status = 'FAILED' ORDER BY createdAt DESC")
    fun failed(): Flow<List<PendingPhotoEntity>>
}
