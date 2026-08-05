package com.warehouseos.operator.ui.screens.shifthome

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.AuthRepository
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.repository.PickTaskRepository
import com.warehouseos.operator.data.repository.SessionRepository
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
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
    pickTaskRepository: PickTaskRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    init {
        // Nudge a sync whenever the operator is on the home screen (back near server).
        syncScheduler.requestSync()
    }

    val fullName: String
        get() = authRepository.cachedUser()?.fullName.orEmpty()

    /** Authenticated user's role, mapped to a Persian label (empty if unknown). */
    val roleLabel: String
        get() = when (authRepository.cachedUser()?.role) {
            "ADMIN" -> "مدیر کل"
            "MANAGER" -> "مدیر انبار"
            "STAFF" -> "اپراتور انبار"
            "SALES" -> "فروشنده"
            else -> ""
        }

    /** فروش برای مدیر/ادمین/فروشنده — کاهش موجودی یک حرکت پولی است. */
    val isManager: Boolean
        get() = authRepository.cachedUser()?.canSell == true

    /** Active shift session id, or null when no shift is running. */
    val sessionId: StateFlow<String?> = sessionRepository.sessionId

    /** Operations captured locally but not yet synced — the "N pending" badge. */
    val pendingCount: StateFlow<Int> = outboxRepository.unsyncedCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    /**
     * کارهای برداشتی که هنوز منتظر این کارگر هستند — بج روی کارت «کار برداشت».
     *
     * poll فقط تا وقتی صفحه واقعاً آن را collect می‌کند اجرا می‌شود؛ قبلاً در init
     * راه می‌افتاد و تا آخر عمر ViewModel ادامه داشت، یعنی حتی وقتی کارگر در صفحه‌ی
     * دیگری بود هم هر ۲۰ ثانیه به سرور می‌زد.
     */
    val pendingPickCount: StateFlow<Int> = flow {
        while (true) {
            when (val r = pickTaskRepository.mine()) {
                is ApiResult.Success -> emit(r.data.count { it.status == "PENDING" })
                else -> {} // offline/error — keep the last known count
            }
            delay(PICK_POLL_MS)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

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
        // logout حالا سرور را هم خبر می‌کند، پس باید در کوروتین اجرا شود.
        viewModelScope.launch {
            sessionRepository.endShift()
            authRepository.logout()
        }
    }

    companion object {
        private const val PICK_POLL_MS = 20_000L
    }
}
