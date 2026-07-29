package com.warehouseos.operator.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * DI stub (Epic 0). Room database + DAO providers land in Epic 8 (offline queue).
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule
