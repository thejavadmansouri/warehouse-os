package com.warehouseos.operator.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface OutboxDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(op: OutboxEntity)

    /**
     * Rows the sync worker auto-drains (FIFO). Only PENDING: a FAILED row is
     * terminal — the server answered and rejected it, so re-sending it on every
     * sync would just hammer the API forever. FAILED rows come back via
     * [retry] (manual) after the user sees the error.
     */
    @Query("SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY createdAt ASC")
    suspend fun getSyncable(): List<OutboxEntity>

    @Query("UPDATE outbox SET status = :status, attemptCount = :attempts, lastError = :error WHERE clientRequestId = :id")
    suspend fun updateStatus(id: String, status: String, attempts: Int, error: String?)

    /** Manual retry: a FAILED row goes back to PENDING and drains on the next sync. */
    @Query("UPDATE outbox SET status = 'PENDING', attemptCount = 0, lastError = NULL WHERE clientRequestId = :id")
    suspend fun retry(id: String)

    /** Count still awaiting sync — drives the "N pending" badge. */
    @Query("SELECT COUNT(*) FROM outbox WHERE status IN ('PENDING','FAILED')")
    fun unsyncedCount(): Flow<Int>

    @Query("SELECT * FROM outbox WHERE status = 'FAILED' ORDER BY createdAt DESC")
    fun failed(): Flow<List<OutboxEntity>>

    /** Returns rows removed — 0 means the op had already synced and is gone. */
    @Query("DELETE FROM outbox WHERE clientRequestId = :id")
    suspend fun delete(id: String): Int

    @Query("DELETE FROM outbox WHERE status = 'SYNCED'")
    suspend fun clearSynced()
}
