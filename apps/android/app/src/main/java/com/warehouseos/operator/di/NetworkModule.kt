package com.warehouseos.operator.di

import com.warehouseos.operator.BuildConfig
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.interceptor.AuthInterceptor
import com.warehouseos.operator.data.session.InMemoryTokenProvider
import com.warehouseos.operator.data.session.TokenProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Provides the networking stack (Epic 1). Base URL comes from the flavor's
 * [BuildConfig.BASE_URL]; Epic 9 makes it runtime-configurable.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true // backend sends more fields than the app models
        explicitNulls = false
        isLenient = true
    }

    // Interceptor reads the token via the interface; login writes it via the concrete type.
    @Provides
    @Singleton
    fun provideTokenProvider(impl: InMemoryTokenProvider): TokenProvider = impl

    @Provides
    @Singleton
    fun provideOkHttpClient(authInterceptor: AuthInterceptor): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL.ensureTrailingSlash())
            .client(client)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService =
        retrofit.create(ApiService::class.java)

    // Retrofit requires the base URL to end with '/'.
    private fun String.ensureTrailingSlash(): String =
        if (endsWith("/")) this else "$this/"
}
