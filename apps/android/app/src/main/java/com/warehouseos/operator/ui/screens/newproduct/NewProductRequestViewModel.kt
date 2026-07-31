package com.warehouseos.operator.ui.screens.newproduct

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.repository.ProductRequestRepository
import com.warehouseos.operator.data.repository.SessionRepository
import com.warehouseos.operator.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NewProductUiState(
    val name: String = "",
    val brand: String = "",
    val vehicles: List<String> = emptyList(),
    val vehicleInput: String = "",
    val quantity: Int = 1,
    val unit: String = "عدد",
    val notes: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
) {
    val canSubmit: Boolean get() = name.isNotBlank() && quantity >= 1 && !isSubmitting
}

/**
 * New-product request form. Prefilled from the voice parse / manual search so the
 * worker only reviews and submits. Never creates a Product directly — it queues a
 * request for manager approval.
 */
@HiltViewModel
class NewProductRequestViewModel @Inject constructor(
    private val repository: ProductRequestRepository,
    private val sessionRepository: SessionRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val barcode: String = savedStateHandle.get<String>(Routes.ARG_BARCODE).orEmpty()
    private val voiceText: String = savedStateHandle.get<String>(Routes.ARG_VOICE).orEmpty()

    private val _uiState = MutableStateFlow(
        NewProductUiState(
            name = savedStateHandle.get<String>(Routes.ARG_NAME).orEmpty(),
            brand = savedStateHandle.get<String>(Routes.ARG_BRAND).orEmpty(),
            vehicles = savedStateHandle.get<String>(Routes.ARG_VEHICLE)
                .orEmpty().takeIf { it.isNotBlank() }?.let { listOf(it) } ?: emptyList(),
            quantity = savedStateHandle.get<String>(Routes.ARG_QTY)?.toIntOrNull()?.coerceAtLeast(1) ?: 1,
            unit = savedStateHandle.get<String>(Routes.ARG_UNIT)?.takeIf { it.isNotBlank() } ?: "عدد",
        ),
    )
    val uiState: StateFlow<NewProductUiState> = _uiState.asStateFlow()

    fun onNameChange(v: String) = _uiState.update { it.copy(name = v, error = null) }
    fun onBrandChange(v: String) = _uiState.update { it.copy(brand = v) }
    fun onUnitChange(v: String) = _uiState.update { it.copy(unit = v) }
    fun onNotesChange(v: String) = _uiState.update { it.copy(notes = v) }
    fun onVehicleInputChange(v: String) = _uiState.update { it.copy(vehicleInput = v) }

    fun incQuantity() = _uiState.update { it.copy(quantity = it.quantity + 1) }
    fun decQuantity() = _uiState.update { it.copy(quantity = (it.quantity - 1).coerceAtLeast(1)) }

    fun addVehicle() = _uiState.update {
        val v = it.vehicleInput.trim()
        if (v.isBlank() || it.vehicles.contains(v)) it.copy(vehicleInput = "")
        else it.copy(vehicles = it.vehicles + v, vehicleInput = "")
    }

    fun removeVehicle(v: String) = _uiState.update { it.copy(vehicles = it.vehicles - v) }

    fun submit() {
        // Commit a typed-but-not-yet-added vehicle so it isn't silently dropped.
        val pending = _uiState.value.vehicleInput.trim()
        if (pending.isNotBlank()) {
            _uiState.update {
                if (it.vehicles.contains(pending)) it.copy(vehicleInput = "")
                else it.copy(vehicles = it.vehicles + pending, vehicleInput = "")
            }
        }
        val s = _uiState.value
        if (!s.canSubmit) return
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            val body = CreateProductRequestBody(
                name = s.name.trim(),
                brandName = s.brand.trim().ifBlank { null },
                vehicles = s.vehicles,
                quantity = s.quantity,
                unit = s.unit.trim().ifBlank { "عدد" },
                notes = s.notes.trim().ifBlank { null },
                voiceText = voiceText.ifBlank { null },
                locationBarcode = barcode.ifBlank { null },
                sessionId = sessionRepository.sessionId.value,
            )
            when (val result = repository.submit(body)) {
                is ApiResult.Success -> _uiState.update { it.copy(isSubmitting = false, done = true) }
                ApiResult.Unauthorized -> fail("نشست شما منقضی شده. دوباره وارد شوید")
                is ApiResult.NetworkError -> fail("اتصال به سرور برقرار نشد. شبکه را بررسی کنید")
                is ApiResult.ServerError -> fail(result.message)
            }
        }
    }

    private fun fail(message: String) =
        _uiState.update { it.copy(isSubmitting = false, error = message) }
}
