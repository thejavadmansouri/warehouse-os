package com.warehouseos.operator.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.BuildConfig
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.safeApiCall
import com.warehouseos.operator.data.repository.AuthRepository
import com.warehouseos.operator.data.settings.SettingsStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val baseUrl: String = "",
    val isTesting: Boolean = false,
    val testResult: String? = null,
    val testOk: Boolean? = null,
    val savedMessage: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: SettingsStore,
    private val authRepository: AuthRepository,
    private val api: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState(baseUrl = settings.baseUrl()))
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    val username: String get() = authRepository.cachedUser()?.username.orEmpty()
    val role: String get() = authRepository.cachedUser()?.role.orEmpty()
    val versionName: String get() = BuildConfig.VERSION_NAME

    fun onBaseUrlChange(value: String) {
        _uiState.update { it.copy(baseUrl = value, savedMessage = null, testResult = null, testOk = null) }
    }

    fun save() {
        settings.setBaseUrl(_uiState.value.baseUrl)
        _uiState.update { it.copy(savedMessage = "آدرس ذخیره شد", baseUrl = settings.baseUrl()) }
    }

    /**
     * Pings /me through the interceptor (which uses the saved URL). Any HTTP
     * response — even 401 — means the server is reachable; only a network failure
     * means it isn't. Save first so the test targets the intended URL.
     */
    fun testConnection() {
        settings.setBaseUrl(_uiState.value.baseUrl)
        _uiState.update { it.copy(isTesting = true, testResult = null, testOk = null) }
        viewModelScope.launch {
            val (ok, message) = when (safeApiCall { api.me() }) {
                is ApiResult.Success -> true to "اتصال برقرار است"
                ApiResult.Unauthorized -> true to "سرور در دسترس است (نیاز به ورود مجدد)"
                is ApiResult.ServerError -> true to "سرور پاسخ داد"
                is ApiResult.NetworkError -> false to "اتصال ناموفق. آدرس و شبکه را بررسی کنید"
            }
            _uiState.update { it.copy(isTesting = false, testOk = ok, testResult = message) }
        }
    }
}
