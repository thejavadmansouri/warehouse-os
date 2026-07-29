package com.warehouseos.operator.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * DI stub (Epic 0). Repository bindings (Auth, Inventory, Count, Sync) land in
 * Epics 2, 6, 7, and 8 respectively.
 */
@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule
