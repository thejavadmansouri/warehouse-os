package com.warehouseos.operator.ui.screens.picktasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.PickTaskDto
import com.warehouseos.operator.data.repository.PickTaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PickTasksUiState(
    /** فقط بار اول لودینگِ تمام‌صفحه؛ رفرش‌های بعدی بی‌صدا هستند. */
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<PickTaskDto> = emptyList(),
    /** idهایی که همین الان درحال ثبتِ «آوردم» هستند (جلوگیری از دو تپ). */
    val pickingIds: Set<String> = emptySet(),
    /** پیام گذرا، مثلاً وقتی کارگر دیگری زودتر آن قلم را برده باشد. */
    val toast: String? = null,
)

/**
 * «کار برداشت» — کارگر صف کارهایش را می‌بیند و بعد از برداشتنِ هر قلم تیک می‌زند.
 *
 * صف روی LAN با polling ساده گرفته می‌شود (نه FCM — سرور on-prem است و به
 * اینترنت/سرویس گوگل وصل نیست). هر چند ثانیه بی‌صدا رفرش می‌شود تا کارِ تازه‌ای
 * که فروشنده فرستاده زود دیده شود.
 */
@HiltViewModel
class PickTasksViewModel @Inject constructor(
    private val repo: PickTaskRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PickTasksUiState())
    val uiState: StateFlow<PickTasksUiState> = _uiState.asStateFlow()

    init {
        load()
        startPolling()
    }

    fun load() {
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch { refresh(showError = true) }
    }

    private fun startPolling() {
        viewModelScope.launch {
            while (true) {
                delay(POLL_INTERVAL_MS)
                // رفرشِ بی‌صدا — بدون لودینگ و بدون پاک‌کردن پیام خطای قبلی.
                refresh(showError = false)
            }
        }
    }

    /**
     * صف را دوباره می‌گیرد و با حالت محلی merge می‌کند: قلم‌هایی که همین‌جا PICKED
     * شده‌اند کم‌رنگ سرِ جایشان می‌مانند تا کارگر گم نکند کجا بود؛ صرفِ غیبتشان از
     * پاسخِ سرور (که فقط PENDINGها را می‌دهد) آن‌ها را حذف نمی‌کند.
     */
    private suspend fun refresh(showError: Boolean) {
        when (val r = repo.mine()) {
            is ApiResult.Success -> _uiState.update { state ->
                state.copy(loading = false, error = null, items = merge(state.items, r.data))
            }
            is ApiResult.Unauthorized -> _uiState.update {
                it.copy(loading = false, error = if (showError || it.items.isEmpty()) "نشست منقضی شده — دوباره وارد شوید" else it.error)
            }
            is ApiResult.NetworkError -> _uiState.update {
                it.copy(loading = false, error = if (showError || it.items.isEmpty()) "اتصال به سرور برقرار نشد" else it.error)
            }
            is ApiResult.ServerError -> _uiState.update {
                it.copy(loading = false, error = if (showError || it.items.isEmpty()) "خطای سرور (${r.code})" else it.error)
            }
        }
    }

    /**
     * قلم‌های PICKED که محلی داریم و دیگر در پاسخِ سرور نیستند را نگه می‌دارد و
     * پایین لیست کم‌رنگ نشان می‌دهد. بقیه از سرور می‌آیند (منبع حقیقت برای PENDINGها).
     */
    private fun merge(old: List<PickTaskDto>, fresh: List<PickTaskDto>): List<PickTaskDto> {
        val freshIds = fresh.map { it.id }.toSet()
        val locallyPicked = old.filter { it.status == "PICKED" && it.id !in freshIds }
        return fresh + locallyPicked
    }

    fun markPicked(id: String) {
        viewModelScope.launch { claimAndUpdate(id) }
    }

    /**
     * «همه را آوردم» برای یک قفسه — همه‌ی قلم‌های در انتظارِ همان مکان را پشت‌سرهم
     * ثبت می‌کند. کارگر جلوی قفسه ایستاده، یک تپ بزرگ کافی است.
     */
    fun markAllAtLocation(locationId: String) {
        viewModelScope.launch {
            for (task in _uiState.value.items) {
                if (task.status != "PENDING") continue
                // کلید گروه‌بندی باید دقیقاً همان چیزی باشد که صفحه ساخت.
                if ((task.location?.id ?: NO_LOCATION_KEY) != locationId) continue
                // هر ادعا اتمیک است؛ اگر دیگری زودتر برده باشد پیام می‌آید و ادامه می‌دهیم.
                val ok = claimAndUpdate(task.id)
                if (!ok) break
            }
        }
    }

    /**
     * یک قلم را «آوردم» می‌زند و حالت را به‌روز می‌کند. برمی‌گرداند که ادامه‌ی
     * زنجیره منطقی است یا نه (خطای شبکه → بشکن).
     */
    private suspend fun claimAndUpdate(id: String): Boolean {
        val s = _uiState.value
        if (id in s.pickingIds) return false
        if (s.items.firstOrNull { it.id == id }?.status == "PICKED") return false
        _uiState.update { it.copy(pickingIds = it.pickingIds + id) }
        return when (val r = repo.markPicked(id)) {
            is ApiResult.Success -> {
                _uiState.update { st ->
                    st.copy(
                        pickingIds = st.pickingIds - id,
                        items = st.items.map { if (it.id == id) r.data else it },
                    )
                }
                true
            }
            // فقط ۴۰۹ یعنی «کارگر دیگری زودتر برده» — پیام سرور نام او را دارد و
            // قلم واقعاً رفته، پس کم‌رنگش می‌کنیم. هر خطای دیگری (۵۰۰، ۴۰۰، …) یعنی
            // ثبت **نشده**؛ اگر آن را هم PICKED نشان بدهیم کارگر فکر می‌کند کارش تمام
            // شده در حالی که سرور هنوز PENDING دارد.
            is ApiResult.ServerError -> {
                val takenByOther = r.code == HTTP_CONFLICT
                _uiState.update { st ->
                    st.copy(
                        pickingIds = st.pickingIds - id,
                        toast = if (takenByOther) r.message else "ثبت نشد (${r.code}) — دوباره تلاش کنید",
                        items = if (takenByOther) {
                            st.items.map { if (it.id == id) it.copy(status = "PICKED") else it }
                        } else {
                            st.items
                        },
                    )
                }
                takenByOther
            }
            is ApiResult.Unauthorized -> {
                _uiState.update {
                    it.copy(pickingIds = it.pickingIds - id, toast = "نشست منقضی شده — دوباره وارد شوید")
                }
                false
            }
            is ApiResult.NetworkError -> {
                _uiState.update {
                    it.copy(pickingIds = it.pickingIds - id, toast = "ثبت نشد — اتصال برقرار نیست، دوباره تلاش کنید")
                }
                false
            }
        }
    }

    fun clearToast() = _uiState.update { it.copy(toast = null) }

    companion object {
        private const val POLL_INTERVAL_MS = 8_000L
        private const val HTTP_CONFLICT = 409
    }
}

/** کلید گروه قلم‌هایی که مکان ندارند — باید با کلید گروه‌بندیِ صفحه یکی باشد. */
internal const val NO_LOCATION_KEY = "no-location"
