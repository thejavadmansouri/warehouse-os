package com.warehouseos.operator.ui.screens.startup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.repository.AuthRepository
import com.warehouseos.operator.data.repository.StartupDestination
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** UI state for the startup gate: null while deciding, then a destination. */
@HiltViewModel
class StartupViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _destination = MutableStateFlow<StartupDestination?>(null)
    val destination: StateFlow<StartupDestination?> = _destination.asStateFlow()

    init {
        viewModelScope.launch {
            _destination.value = authRepository.resolveStartDestination()
        }
    }
}
