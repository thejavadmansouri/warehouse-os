package com.warehouseos.operator.ui.screens.newproduct

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.repository.ProductRequestRepository
import com.warehouseos.operator.data.repository.SessionRepository
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import com.warehouseos.operator.data.speech.SttEvent
import com.warehouseos.operator.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
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
    /** میکروفون روشن است و برای کدام فیلد. */
    val listeningField: DictationField? = null,
    val partialText: String = "",
    /** دوربینِ اسکنِ بارکدِ کالا باز است. */
    val scanning: Boolean = false,
    /**
     * بارکد کالا — یا از صفحه‌ی قبل آمده یا همین‌جا اسکن شده.
     *
     * اینجا هم قابل اسکن است چون کارگری که از مسیر صدا رسیده هیچ بارکدی همراه
     * ندارد، در حالی که جعبه ممکن است بارکد داشته باشد؛ بدون این، آن بارکد
     * برای همیشه از دست می‌رفت.
     */
    val productBarcode: String = "",
) {
    val canSubmit: Boolean get() = name.isNotBlank() && quantity >= 1 && !isSubmitting
}

/**
 * New-product request form. Prefilled from the voice parse / manual search so the
 * worker only reviews and submits. Never creates a Product directly — it queues a
 * request for manager approval.
 */
/** فیلدهایی که می‌شود برایشان حرف زد. */
enum class DictationField { NAME, BRAND, VEHICLE, NOTES }

@HiltViewModel
class NewProductRequestViewModel @Inject constructor(
    private val repository: ProductRequestRepository,
    private val sessionRepository: SessionRepository,
    private val speech: SpeechToTextProvider,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private var listenJob: Job? = null

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
            // یا از صفحه‌ی قبل آمده، یا کارگر همین‌جا اسکنش می‌کند.
            productBarcode = savedStateHandle.get<String>(Routes.ARG_PRODUCT_BARCODE).orEmpty(),
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

    // ---------- Dictation ----------
    /**
     * گفتنِ یک فیلد به‌جای تایپ‌کردنش.
     *
     * بیشترین تایپِ کلِ برنامه همین فرم است و کارگر با دستکش پایش ایستاده.
     * متن روی چیزی که هست جایگزین می‌شود، نه اضافه — اصلاحِ یک اشتباه نباید
     * پاک‌کردنِ دستی لازم داشته باشد.
     */
    fun dictate(field: DictationField) {
        if (_uiState.value.listeningField != null) {
            stopDictation()
            return
        }
        _uiState.update { it.copy(listeningField = field, partialText = "", error = null) }
        listenJob = viewModelScope.launch {
            speech.transcribe().collect { event ->
                when (event) {
                    is SttEvent.Partial ->
                        _uiState.update { it.copy(partialText = event.text) }

                    is SttEvent.Final -> {
                        val text = event.text.trim()
                        _uiState.update { st ->
                            val next = st.copy(listeningField = null, partialText = "")
                            if (text.isBlank()) next else when (field) {
                                DictationField.NAME -> next.copy(name = text)
                                DictationField.BRAND -> next.copy(brand = text)
                                DictationField.VEHICLE -> next.copy(vehicleInput = text)
                                DictationField.NOTES -> next.copy(notes = text)
                            }
                        }
                    }

                    is SttEvent.Error ->
                        _uiState.update {
                            it.copy(
                                listeningField = null,
                                partialText = "",
                                error = "صدا شنیده نشد — دوباره تلاش کنید یا تایپ کنید",
                            )
                        }
                }
            }
        }
    }

    fun stopDictation() {
        listenJob?.cancel()
        listenJob = null
        _uiState.update { it.copy(listeningField = null, partialText = "") }
    }

    // ---------- Barcode ----------
    fun openScanner() = _uiState.update { it.copy(scanning = true, error = null) }

    fun closeScanner() = _uiState.update { it.copy(scanning = false) }

    /** بارکدِ جعبه که همین‌جا اسکن شد — با تأیید مدیر به کالا وصل می‌شود. */
    fun onBarcodeScanned(raw: String) {
        val code = raw.trim()
        _uiState.update {
            it.copy(scanning = false, productBarcode = code.ifBlank { it.productBarcode })
        }
    }

    fun clearBarcode() = _uiState.update { it.copy(productBarcode = "") }

    override fun onCleared() {
        listenJob?.cancel()
        super.onCleared()
    }

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
                productBarcode = s.productBarcode.ifBlank { null },
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
