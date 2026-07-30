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

    /** Rows that still need uploading (never-sent or previously failed), FIFO. */
    @Query("SELECT * FROM outbox WHERE status IN ('PENDING','FAILED') ORDER BY createdAt ASC")
    suspend fun getSyncable(): List<OutboxEntity>

    @Query("UPDATE outbox SET status = :status, attemptCount = :attempts, lastError = :error WHERE clientRequestId = :id")
    suspend fun updateStatus(id: String, status: String, attempts: Int, error: String?)

    /** Count still awaiting sync — drives the "N pending" badge. */
    @Query("SELECT COUNT(*) FROM outbox WHERE status IN ('PENDING','FAILED')")
    fun unsyncedCount(): Flow<Int>

    @Query("SELECT * FROM outbox WHERE status = 'FAILED' ORDER BY createdAt DESC")
    fun failed(): Flow<List<OutboxEntity>>

    @Query("DELETE FROM outbox WHERE clientRequestId = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM outbox WHERE status = 'SYNCED'")
    suspend fun clearSynced()
}
