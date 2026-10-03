package com.warehouseos.operator.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkTaskDao {

    @Query("SELECT * FROM work_task ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<WorkTaskEntity>>

    @Query("SELECT * FROM work_task WHERE id = :taskId")
    fun observeTask(taskId: String): Flow<WorkTaskEntity?>

    @Query("SELECT * FROM work_task_item WHERE taskId = :taskId ORDER BY position ASC")
    fun observeItems(taskId: String): Flow<List<WorkTaskItemEntity>>

    /** بازنشانی صف محلی با آخرین پاسخ سرور — فقط بعد از fetch موفق صدا زده شود. */
    @Query("DELETE FROM work_task")
    suspend fun clearAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertTasks(tasks: List<WorkTaskEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertItems(items: List<WorkTaskItemEntity>)

    /** تیک خوش‌بینانه — فقط اگر هنوز PENDING باشد؛ برمی‌گرداند که چند ردیف عوض شد. */
    @Query(
        "UPDATE work_task_item SET status = 'DONE' " +
            "WHERE id = :itemId AND taskId = :taskId AND status = 'PENDING'",
    )
    suspend fun markItemDone(taskId: String, itemId: String): Int

    /** پیشرفت کار را پس از تیک بازمحاسبه می‌کند (هرگز به عقب برنمی‌گردد). */
    @Query(
        "UPDATE work_task SET doneItems = doneItems + 1, " +
            "status = CASE WHEN doneItems + 1 = totalItems THEN 'COMPLETED' " +
            "WHEN doneItems + 1 > 0 AND status = 'PENDING' THEN 'IN_PROGRESS' " +
            "ELSE status END " +
            "WHERE id = :taskId AND status != 'CANCELLED' AND doneItems < totalItems",
    )
    suspend fun bumpTaskProgress(taskId: String)
}
