package com.warehouseos.operator.ui.screens.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.notifications.PickTaskWatcherController
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.AuthRepository
import com.warehouseos.operator.data.settings.SettingsStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val serverUrl: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val loggedIn: Boolean = false,
) {
    val canSubmit: Boolean
        get() = username.isNotBlank() && password.isNotBlank() && !isSubmitting
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val settings: SettingsStore,
    private val watcher: PickTaskWatcherController,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState(serverUrl = settings.baseUrl()))
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onUsernameChange(value: String) = _state.update { it.copy(username = value, error = null) }

    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }

    /** Persisted immediately so the OkHttp interceptor uses it on the next request. */
    fun onServerUrlChange(value: String) {
        settings.setBaseUrl(value)
        _state.update { it.copy(serverUrl = value, error = null) }
    }

    fun login() {
        val current = _state.value
        if (!current.canSubmit) return
        _state.update { it.copy(isSubmitting = true, error = null) }

        viewModelScope.launch {
            when (val result = authRepository.login(current.username, current.password)) {
                is ApiResult.Success -> {
                    // Role gate (task 16): only operator roles may proceed.
                    if (result.data.isAllowedOperator) {
                        // Start ringing for new pick tasks as soon as we're in.
                        watcher.start()
                        _state.update { it.copy(isSubmitting = false, loggedIn = true) }
                    } else {
                        authRepository.logout()
                        _state.update {
                            it.copy(isSubmitting = false, error = "دسترسی غیرمجاز")
                        }
                    }
                }
                ApiResult.Unauthorized ->
                    _state.update {
                        it.copy(isSubmitting = false, error = "نام کاربری یا رمز عبور اشتباه است")
                    }
                is ApiResult.NetworkError ->
                    _state.update {
                        it.copy(
                            isSubmitting = false,
                            error = "اتصال به سرور برقرار نشد. شبکه را بررسی کنید",
                        )
                    }
                is ApiResult.ServerError ->
                    _state.update { it.copy(isSubmitting = false, error = result.message) }
            }
        }
    }
}
