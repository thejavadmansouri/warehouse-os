package com.warehouseos.operator.ui.screens.shifthome

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.AuthRepository
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.repository.SessionRepository
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ShiftHomeUiState(
    val isStarting: Boolean = false,
    val error: String? = null,
)

/**
 * ShiftHome logic (Epic 4): start a shift, expose the active session, log out.
 */
@HiltViewModel
class ShiftHomeViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionRepository: SessionRepository,
    outboxRepository: OutboxRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    init {
        // Nudge a sync whenever the operator is on the home screen (back near server).
        syncScheduler.requestSync()
    }

    val fullName: String
        get() = authRepository.cachedUser()?.fullName.orEmpty()

    /** Active shift session id, or null when no shift is running. */
    val sessionId: StateFlow<String?> = sessionRepository.sessionId

    /** Operations captured locally but not yet synced — the "N pending" badge. */
    val pendingCount: StateFlow<Int> = outboxRepository.unsyncedCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    fun syncNow() = syncScheduler.requestSync()

    private val _uiState = MutableStateFlow(ShiftHomeUiState())
    val uiState: StateFlow<ShiftHomeUiState> = _uiState.asStateFlow()

    fun startShift() {
        if (_uiState.value.isStarting) return
        _uiState.update { it.copy(isStarting = true, error = null) }
        viewModelScope.launch {
            val message = when (val result = sessionRepository.startShift()) {
                is ApiResult.Success -> null
                ApiResult.Unauthorized -> "نشست شما منقضی شده. دوباره وارد شوید"
                is ApiResult.NetworkError -> "اتصال به سرور برقرار نشد. شبکه را بررسی کنید"
                is ApiResult.ServerError -> result.message
            }
            _uiState.update { it.copy(isStarting = false, error = message) }
        }
    }

    fun logout() {
        sessionRepository.endShift()
        authRepository.logout()
    }
}
