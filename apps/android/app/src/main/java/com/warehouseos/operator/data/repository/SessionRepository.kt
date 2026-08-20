package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.VoiceSessionStartRequest
import com.warehouseos.operator.data.remote.safeApiCall
import com.warehouseos.operator.data.settings.SessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the active shift's voice-session id and starts/ends shifts (Epic 4).
 *
 * The session is persisted ([SessionStore]) so a mid-day process restart keeps the
 * worker in their shift — they must not be forced back to the server just to
 * continue an offline day. Scan/Voice/Count read [sessionId] from this instance.
 */
@Singleton
class SessionRepository @Inject constructor(
    private val api: ApiService,
    private val sessionStore: SessionStore,
) {
    private val _sessionId = MutableStateFlow<String?>(sessionStore.sessionId())
    val sessionId: StateFlow<String?> = _sessionId.asStateFlow()

    /** POST /inventory-session/start; on success stores the id and returns it. */
    suspend fun startShift(): ApiResult<String> =
        when (val result = safeApiCall { api.startSession(VoiceSessionStartRequest()) }) {
            is ApiResult.Success -> {
                _sessionId.value = result.data.id
                sessionStore.save(result.data.id)
                ApiResult.Success(result.data.id)
            }
            is ApiResult.NetworkError -> result
            is ApiResult.ServerError -> result
            ApiResult.Unauthorized -> ApiResult.Unauthorized
        }

    fun endShift() {
        _sessionId.value = null
        sessionStore.clear()
    }
}
