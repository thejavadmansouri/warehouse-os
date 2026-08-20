package com.warehouseos.operator.ui.screens.worktasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.local.WorkTaskEntity
import com.warehouseos.operator.data.local.WorkTaskItemEntity
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.WorkTaskRepository
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WorkTasksUiState(
    /** فقط بار اول لودینگِ تمام‌صفحه؛ رفرش‌های بعدی بی‌صدا هستند. */
    val loading: Boolean = true,
    val error: String? = null,
    /** null = لیست؛ غیر null = جزئیات همان کار. */
    val selectedTaskId: String? = null,
    val toast: String? = null,
)

/**
 * «کارهای انبار» — کارگر صف کارهایش را می‌بیند، وارد جزئیات می‌شود و قلم‌ها را
 * یکی‌یکی تیک می‌زند. تیک local-first است: اول محلی DONE می‌شود و ردیف در outbox
 * می‌نشیند؛ به محض اتصال به وای‌فای مغازه، sync آن را به سرور می‌برد و POS
 * پیشرفت زنده را می‌گیرد. موجودی هیچ‌جا دست نمی‌خورد.
 */
@HiltViewModel
class WorkTasksViewModel @Inject constructor(
    private val repo: WorkTaskRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    /** صفِ کارها از کش محلی — آفلاین هم دیده می‌شود. */
    val tasks: StateFlow<List<WorkTaskEntity>> = repo.tasks
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** جزئیات یک کار برای صفحه — همان کش محلی. */
    fun observeTask(taskId: String): Flow<WorkTaskEntity?> = repo.observeTask(taskId)

    fun observeItems(taskId: String): Flow<List<WorkTaskItemEntity>> = repo.observeItems(taskId)

    private val _uiState = MutableStateFlow(WorkTasksUiState())
    val uiState: StateFlow<WorkTasksUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
    }

    fun refresh(initial: Boolean = false) {
        if (initial) _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.refresh()) {
                is ApiResult.Success -> _uiState.update { it.copy(loading = false, error = null) }
                is ApiResult.Unauthorized -> _uiState.update {
                    it.copy(loading = false, error = "نشست منقضی شده — دوباره وارد شوید")
                }
                is ApiResult.NetworkError -> _uiState.update {
                    it.copy(loading = false, error = "اتصال به سرور برقرار نشد")
                }
                is ApiResult.ServerError -> _uiState.update {
                    it.copy(loading = false, error = "خطای سرور (${r.code})")
                }
            }
        }
    }

    /** ورود به جزئیات یک کار — قلم‌ها را از سرور می‌گیرد و محلی کش می‌کند. */
    fun select(taskId: String?) {
        if (taskId == null) {
            _uiState.update { it.copy(selectedTaskId = null) }
            return
        }
        _uiState.update { it.copy(selectedTaskId = taskId) }
        viewModelScope.launch {
            when (val r = repo.fetchDetail(taskId)) {
                is ApiResult.Success -> _uiState.update { it.copy(error = null) }
                // آفلاین؟ کش محلیِ قبل کافی است — تیک‌ها همچنان در صف می‌نشینند.
                is ApiResult.NetworkError, ApiResult.Unauthorized -> Unit
                is ApiResult.ServerError -> _uiState.update { it.copy(toast = "جزئیات دریافت نشد (${r.code})") }
            }
        }
    }

    /**
     * تیک خوش‌بینانه‌ی یک قلم. چون تیک فقط محلی + outbox است، همیشه «موفق» است —
     * تنها حالتِ رد، وقتی است که قلم قبلاً DONE شده باشد (تکرارِ تپ).
     */
    fun tick(taskId: String, itemId: String) {
        viewModelScope.launch {
            val newTick = repo.tick(taskId, itemId)
            _uiState.update {
                it.copy(toast = if (newTick) "در صف همگام‌سازی ثبت شد" else "این قلم قبلاً ثبت شده")
            }
            // اگر همین الان به وای‌فای مغازه وصل است، تیک زودتر برود و POS زودتر ببیند.
            syncScheduler.requestSync()
        }
    }

    fun clearToast() = _uiState.update { it.copy(toast = null) }
}
