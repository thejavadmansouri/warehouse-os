package com.warehouseos.operator.di

import com.warehouseos.operator.data.repository.PhotoQueue
import com.warehouseos.operator.data.repository.PhotoRepository
import com.warehouseos.operator.data.settings.CatalogReadyFlag
import com.warehouseos.operator.data.settings.SettingsStore
import com.warehouseos.operator.data.sync.PhotoUploadRequester
import com.warehouseos.operator.data.sync.PhotoUploadScheduler
import com.warehouseos.operator.data.sync.SyncRequester
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Repository/plumbing bindings. [SyncRequester] is bound to the WorkManager-backed
 * [SyncScheduler]; repositories depend on the interface so unit tests can fake
 * the "sync later" call without an Android context.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindSyncRequester(impl: SyncScheduler): SyncRequester

    @Binds
    @Singleton
    abstract fun bindPhotoQueue(impl: PhotoRepository): PhotoQueue

    @Binds
    @Singleton
    abstract fun bindPhotoUploadRequester(impl: PhotoUploadScheduler): PhotoUploadRequester

    @Binds
    @Singleton
    abstract fun bindCatalogReadyFlag(impl: SettingsStore): CatalogReadyFlag
}
