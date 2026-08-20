package com.warehouseos.operator.ui.screens.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.network.NetworkStatus
import com.warehouseos.operator.data.repository.CatalogRepository
import com.warehouseos.operator.data.repository.CatalogSyncResult
import com.warehouseos.operator.data.sync.CatalogSyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CatalogSetupUiState(
    val downloading: Boolean = false,
    val message: String? = null,
    val failed: Boolean = false,
)

/**
 * The gate in front of stock-in. The worker taps «ثبت ورود» and is never asked a
 * question: if the catalog is on the phone they go straight to scanning, and if
 * it isn't, this screen downloads it (Wi-Fi only — the ~50k rows must never burn
 * mobile data) and then forwards them on.
 */
@HiltViewModel
class CatalogSetupViewModel @Inject constructor(
    private val catalog: CatalogRepository,
    private val scheduler: CatalogSyncScheduler,
    private val network: NetworkStatus,
) : ViewModel() {

    /** Drives the forward-to-scan redirect. Seeded synchronously, so a phone that
     *  already has the catalog never flashes this screen. */
    val ready: StateFlow<Boolean> = catalog.ready

    val count: StateFlow<Int> = catalog.count
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private val _uiState = MutableStateFlow(CatalogSetupUiState())
    val uiState: StateFlow<CatalogSetupUiState> = _uiState.asStateFlow()

    init {
        // Not ready → start immediately; the worker shouldn't have to tap anything.
        if (!catalog.ready.value) download()
    }

    /**
     * Foreground download so the worker sees progress and the real error. The
     * background worker is scheduled too, so a Wi-Fi drop mid-way still resumes
     * later without anyone opening the app.
     *
     * Gated on Wi-Fi: this path bypasses the worker's constraint, so without the
     * check it would pull ~50k rows over the worker's SIM data.
     */
    fun download() {
        if (_uiState.value.downloading) return
        // Queue it either way — WorkManager fires the moment shop Wi-Fi is back,
        // even if the worker never reopens the app.
        scheduler.requestSync()

        if (!network.isOnWifi()) {
            _uiState.update {
                it.copy(
                    downloading = false,
                    failed = true,
                    message = "برای دانلود کاتالوگ به وای‌فای مغازه وصل شوید — " +
                        "روی اینترنت سیم‌کارت دانلود نمی‌شود. به‌محض اتصال، خودکار دریافت می‌شود.",
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(downloading = true, message = null, failed = false) }
            val result = catalog.sync()
            catalog.invalidate()
            _uiState.update {
                when (result) {
                    is CatalogSyncResult.Success -> it.copy(
                        downloading = false,
                        failed = false,
                        message = "کاتالوگ آماده شد (${result.rows} ردیف)",
                    )
                    // On Wi-Fi but the server didn't answer — a different problem
                    // from "not on Wi-Fi", so don't tell them to connect again.
                    CatalogSyncResult.NoNetwork -> it.copy(
                        downloading = false,
                        failed = true,
                        message = "سرور مغازه پاسخ نداد — مطمئن شوید به وای‌فای مغازه وصل هستید و سرور روشن است",
                    )
                    is CatalogSyncResult.ServerError -> it.copy(
                        downloading = false,
                        failed = true,
                        message = "خطا در دریافت کاتالوگ: ${result.message}",
                    )
                }
            }
        }
    }
}
