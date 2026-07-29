package com.warehouseos.operator.data.remote.interceptor

import com.warehouseos.operator.data.settings.SettingsStore
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Redirects every request to the currently-configured base URL (Epic 9). Retrofit
 * is built with a fixed base URL, so this interceptor swaps scheme/host/port at
 * request time based on [SettingsStore] — letting the operator repoint the app at
 * a new on-prem server IP without a rebuild. Paths are left untouched.
 */
@Singleton
class BaseUrlInterceptor @Inject constructor(
    private val settings: SettingsStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val configured = settings.baseUrl().toHttpUrlOrNull()
            ?: return chain.proceed(request) // malformed setting → leave the request as-is

        val newUrl = request.url.newBuilder()
            .scheme(configured.scheme)
            .host(configured.host)
            .port(configured.port)
            .build()

        return chain.proceed(request.newBuilder().url(newUrl).build())
    }
}
