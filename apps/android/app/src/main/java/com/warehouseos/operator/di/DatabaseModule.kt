package com.warehouseos.operator.di

import android.content.Context
import androidx.room.Room
import com.warehouseos.operator.data.local.CatalogDao
import com.warehouseos.operator.data.local.OperatorDatabase
import com.warehouseos.operator.data.local.OutboxDao
import com.warehouseos.operator.data.local.PendingPhotoDao
import com.warehouseos.operator.data.local.WorkTaskDao
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
        Room.databaseBuilder(context, OperatorDatabase::class.java, "operator.db")
            .addMigrations(
                OperatorDatabase.MIGRATION_1_2,
                OperatorDatabase.MIGRATION_2_3,
                OperatorDatabase.MIGRATION_3_4,
                OperatorDatabase.MIGRATION_4_5,
            )
            .build()

    @Provides
    fun provideOutboxDao(db: OperatorDatabase): OutboxDao = db.outboxDao()

    @Provides
    fun provideCatalogDao(db: OperatorDatabase): CatalogDao = db.catalogDao()

    @Provides
    fun provideWorkTaskDao(db: OperatorDatabase): WorkTaskDao = db.workTaskDao()

    @Provides
    fun providePendingPhotoDao(db: OperatorDatabase): PendingPhotoDao = db.pendingPhotoDao()
}
