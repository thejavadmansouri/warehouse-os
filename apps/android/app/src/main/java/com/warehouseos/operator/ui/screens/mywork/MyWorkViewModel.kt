package com.warehouseos.operator.ui.screens.mywork

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.MyWorkItem
import com.warehouseos.operator.data.remote.dto.MyWorkSummary
import com.warehouseos.operator.data.repository.MyWorkRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MyWorkUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: MyWorkSummary = MyWorkSummary(),
    val items: List<MyWorkItem> = emptyList(),
)

@HiltViewModel
class MyWorkViewModel @Inject constructor(
    private val repo: MyWorkRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MyWorkUiState())
    val uiState: StateFlow<MyWorkUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.myWork()) {
                is ApiResult.Success ->
                    _uiState.update {
                        it.copy(loading = false, summary = r.data.summary, items = r.data.items)
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
