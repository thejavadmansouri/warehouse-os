package com.warehouseos.operator.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [OutboxEntity::class], version = 1, exportSchema = false)
abstract class OperatorDatabase : RoomDatabase() {
    abstract fun outboxDao(): OutboxDao
}
