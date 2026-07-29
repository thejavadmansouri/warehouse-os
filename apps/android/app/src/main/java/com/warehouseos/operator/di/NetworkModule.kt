package com.warehouseos.operator.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * DI stub (Epic 0). Retrofit/OkHttp/ApiService providers land in Epic 1 (tasks 7–10).
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule
