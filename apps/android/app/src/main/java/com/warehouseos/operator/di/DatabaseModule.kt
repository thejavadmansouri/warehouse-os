package com.warehouseos.operator.di

import android.content.Context
import androidx.room.Room
import com.warehouseos.operator.data.local.OperatorDatabase
import com.warehouseos.operator.data.local.OutboxDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Local persistence (Epic 8). Room database backing the offline outbox.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): OperatorDatabase =
        Room.databaseBuilder(context, OperatorDatabase::class.java, "operator.db").build()

    @Provides
    fun provideOutboxDao(db: OperatorDatabase): OutboxDao = db.outboxDao()
}
