package com.warehouseos.operator.data.remote.interceptor

import com.warehouseos.operator.data.session.AuthEvent
import com.warehouseos.operator.data.session.AuthEventBus
import com.warehouseos.operator.data.session.TokenProvider
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Attaches `Authorization: Bearer <token>` to every request that has a token
 * (task 8), and turns any 401 response into an [AuthEvent.Unauthorized] so the
 * app can force re-login (task 9). The login endpoint is skipped — it has no
 * token yet and must not be blocked.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
    private val authEventBus: AuthEventBus,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()

        val request = if (original.isAuthFree()) {
            original
        } else {
            val token = tokenProvider.currentToken()
            if (token.isNullOrBlank()) {
                original
            } else {
                original.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            }
        }

        val response = chain.proceed(request)
        if (response.code == 401) {
            authEventBus.emit(AuthEvent.Unauthorized)
        }
        return response
    }

    // POST auth/login carries no token and must never be short-circuited.
    private fun okhttp3.Request.isAuthFree(): Boolean =
        url.encodedPath.endsWith("/auth/login")
}
