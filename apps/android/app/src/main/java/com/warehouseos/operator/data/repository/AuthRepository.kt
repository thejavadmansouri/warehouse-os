package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.notifications.WorkTaskWatcherController
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.LoginRequest
import com.warehouseos.operator.data.remote.safeApiCall
import com.warehouseos.operator.data.session.AuthUser
import com.warehouseos.operator.data.session.SecureTokenStore
import javax.inject.Inject
import javax.inject.Singleton

/** Outcome of the app-start session check (Epic 2, task 13). */
enum class StartupDestination { LOGIN, SHIFT_HOME }

/**
 * Single owner of the authentication flow. Wraps [ApiService] auth calls and the
 * encrypted [SecureTokenStore]. All calls return [ApiResult] so callers branch on
 * outcome rather than catching exceptions.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokenStore: SecureTokenStore,
    private val watcher: WorkTaskWatcherController,
) {

    fun cachedUser(): AuthUser? = tokenStore.cachedUser()

    /**
     * Sign out.
     *
     * The local token goes regardless of what the server says — a worker on a
     * dead network still has to be able to hand the phone over. Releasing the
     * server-side session is best effort on top of that.
     */
    suspend fun logout() {
        watcher.stop()
        runCatching { api.logout() }
        tokenStore.clear()
    }

    /**
     * Logs in and, on success, persists the token + user. A 401 here means bad
     * credentials (surfaced as [ApiResult.Unauthorized]); network/server errors
     * pass through unchanged.
     */
    suspend fun login(username: String, password: String): ApiResult<AuthUser> =
        when (val result = safeApiCall { api.login(LoginRequest(username.trim(), password)) }) {
            is ApiResult.Success -> {
                val dto = result.data.user
                val user = AuthUser(
                    id = dto.id,
                    username = dto.username,
                    fullName = dto.fullName.orEmpty(),
                    role = dto.role,
                )
                tokenStore.saveSession(result.data.access_token, user)
                ApiResult.Success(user)
            }
            is ApiResult.NetworkError -> result
            is ApiResult.ServerError -> result
            ApiResult.Unauthorized -> ApiResult.Unauthorized
        }

    /**
     * Decides the start destination (task 13):
     * - no token -> LOGIN
     * - token, and GET /me confirms it (200) -> SHIFT_HOME
     * - token, but 401 -> token is invalid: clear it, LOGIN
     * - token, but network/server error -> can't disprove the token; stay logged
     *   in and go to SHIFT_HOME (offline-tolerant, matching the warehouse LAN
     *   reality). A later real request will re-trigger 401 handling if needed.
     */
    suspend fun resolveStartDestination(): StartupDestination {
        if (tokenStore.currentToken().isNullOrBlank()) return StartupDestination.LOGIN

        return when (safeApiCall { api.me() }) {
            is ApiResult.Success -> StartupDestination.SHIFT_HOME
            ApiResult.Unauthorized -> {
                tokenStore.clear()
                StartupDestination.LOGIN
            }
            is ApiResult.NetworkError, is ApiResult.ServerError -> StartupDestination.SHIFT_HOME
        }
    }
}
