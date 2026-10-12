package com.warehouseos.operator.ui.screens.worktasks

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.local.WorkTaskEntity
import com.warehouseos.operator.data.local.WorkTaskItemEntity
import com.warehouseos.operator.data.photo.PhotoStore
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.PhotoRepository
import com.warehouseos.operator.data.repository.WorkTaskRepository
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

data class WorkTasksUiState(
    /** فقط بار اول لودینگِ تمام‌صفحه؛ رفرش‌های بعدی بی‌صدا هستند. */
    val loading: Boolean = true,
    val error: String? = null,
    /** null = لیست؛ غیر null = جزئیات همان کار. */
    val selectedTaskId: String? = null,
    val toast: String? = null,
    /** دوربین عکسِ چیدن باز است. */
    val capturingPhotos: Boolean = false,
    val capturePhotoCount: Int = 0,
)

/**
 * «کارهای انبار» — کارگر صف کارهایش را می‌بیند، وارد جزئیات می‌شود و قلم‌ها را
 * یکی‌یکی تیک می‌زند. برای چیدن، بعد از اسکن قفسه می‌تواند عکس بگیرد تا همان
 * مسیر فشرده‌سازی + واترمارک سایت پر شود.
 */
@HiltViewModel
class WorkTasksViewModel @Inject constructor(
    private val repo: WorkTaskRepository,
    private val syncScheduler: SyncScheduler,
    private val photoRepository: PhotoRepository,
    private val photoStore: PhotoStore,
) : ViewModel() {

    val tasks: StateFlow<List<WorkTaskEntity>> = repo.tasks
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeTask(taskId: String): Flow<WorkTaskEntity?> = repo.observeTask(taskId)

    fun observeItems(taskId: String): Flow<List<WorkTaskItemEntity>> = repo.observeItems(taskId)

    private val _uiState = MutableStateFlow(WorkTasksUiState())
    val uiState: StateFlow<WorkTasksUiState> = _uiState.asStateFlow()

    /** قلمِ در حال عکس‌برداری بعد از اسکن مقصد. */
    private var pendingPutaway: PendingPutaway? = null

    data class PendingPutaway(
        val taskId: String,
        val itemId: String,
        val barcode: String,
    )

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

    fun select(taskId: String?) {
        if (taskId == null) {
            _uiState.update { it.copy(selectedTaskId = null) }
            return
        }
        _uiState.update { it.copy(selectedTaskId = taskId) }
        viewModelScope.launch {
            when (val r = repo.fetchDetail(taskId)) {
                is ApiResult.Success -> _uiState.update { it.copy(error = null) }
                is ApiResult.NetworkError, ApiResult.Unauthorized -> Unit
                is ApiResult.ServerError -> _uiState.update { it.copy(toast = "جزئیات دریافت نشد (${r.code})") }
            }
        }
    }

    /**
     * بعد از اسکن قفسهٔ مقصد: دوربین عکس باز می‌شود.
     * کارگر می‌تواند عکس بگیرد یا رد کند؛ بعد تیک ثبت می‌شود.
     */
    fun beginPutawayPhoto(taskId: String, itemId: String, barcode: String) {
        pendingPutaway = PendingPutaway(taskId, itemId, barcode)
        _uiState.update {
            it.copy(capturingPhotos = true, capturePhotoCount = 0)
        }
    }

    fun createCaptureFile(): File = photoStore.createCaptureFile()

    fun onPutawayCapture(raw: File) {
        val pending = pendingPutaway ?: run {
            photoStore.deleteCapture(raw)
            return
        }
        viewModelScope.launch {
            val compressed = withContext(Dispatchers.IO) {
                val out = photoStore.compress(Uri.fromFile(raw))
                photoStore.deleteCapture(raw)
                out
            }
            if (compressed == null) {
                _uiState.update { it.copy(toast = "عکس خوانده نشد — دوباره بگیرید") }
                return@launch
            }
            val ok = photoRepository.attachReadyForWorkTaskItem(pending.itemId, compressed)
            if (!ok) {
                _uiState.update { it.copy(toast = "عکس ذخیره نشد") }
                return@launch
            }
            _uiState.update {
                it.copy(
                    capturePhotoCount = it.capturePhotoCount + 1,
                    toast = "عکس برای سایت ذخیره شد",
                )
            }
        }
    }

    /** پایان عکس‌برداری (یا رد کردن) → تیک چیدن. */
    fun finishPutawayPhotos() {
        val pending = pendingPutaway
        pendingPutaway = null
        _uiState.update { it.copy(capturingPhotos = false, capturePhotoCount = 0) }
        if (pending != null) {
            tick(pending.taskId, pending.itemId, pending.barcode)
        }
    }

    fun tick(taskId: String, itemId: String, toLocationBarcode: String? = null) {
        viewModelScope.launch {
            val newTick = repo.tick(taskId, itemId, toLocationBarcode)
            _uiState.update {
                it.copy(toast = if (newTick) "در صف همگام‌سازی ثبت شد" else "این قلم قبلاً ثبت شده")
            }
            syncScheduler.requestSync()
        }
    }

    fun clearToast() = _uiState.update { it.copy(toast = null) }

    companion object {
        const val MAX_PUTAWAY_PHOTOS = 3
    }
}
