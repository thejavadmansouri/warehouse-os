package com.warehouseos.operator.ui.screens.locate

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.LocateResultDto
import com.warehouseos.operator.data.repository.LocateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LocateUiState(
    val query: String = "",
    val loading: Boolean = false,
    val searched: Boolean = false,
    val results: List<LocateResultDto> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class LocateViewModel @Inject constructor(
    private val repo: LocateRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LocateUiState())
    val uiState: StateFlow<LocateUiState> = _uiState.asStateFlow()

    fun onQueryChange(q: String) = _uiState.update { it.copy(query = q, error = null) }

    fun search() {
        val q = _uiState.value.query.trim()
        if (q.isBlank()) return
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.locate(q)) {
                is ApiResult.Success ->
                    _uiState.update {
                        it.copy(loading = false, searched = true, results = r.data)
                    }
                is ApiResult.Unauthorized ->
                    _uiState.update { it.copy(loading = false, error = "نشست منقضی شده — دوباره وارد شوید") }
                is ApiResult.NetworkError ->
                    _uiState.update { it.copy(loading = false, error = "اتصال به سرور برقرار نشد") }
                is ApiResult.ServerError ->
                    _uiState.update { it.copy(loading = false, error = "خطای سرور (${r.code})") }
            }
        }
    }
}
