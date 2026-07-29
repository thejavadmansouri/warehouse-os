package com.warehouseos.operator.ui.screens.count

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.CountVoiceResponse
import com.warehouseos.operator.data.repository.CountRepository
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import com.warehouseos.operator.data.speech.SttError
import com.warehouseos.operator.data.speech.SttEvent
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class CountPhase { SCAN, COUNTING }

/** One recorded count line for the running list. */
data class CountedItem(
    val name: String,
    val goodQuantity: Int,
    val badQuantity: Int,
    val reviewStatus: String?, // CONFIRMED | NEEDS_REVIEW | NEEDS_CORRECTION | null
    val matched: Boolean,
)

data class CountUiState(
    val phase: CountPhase = CountPhase.SCAN,
    val locationName: String = "",
    val isStarting: Boolean = false,
    val isListening: Boolean = false,
    val partialText: String = "",
    val isSubmitting: Boolean = false,
    val items: List<CountedItem> = emptyList(),
    val error: String? = null,
)

/**
 * Inventory count flow (Epic 7): scan a shelf → start a count → speak each item →
 * append to a running list with its match/review status. Basic visuals.
 */
@HiltViewModel
class CountViewModel @Inject constructor(
    private val speech: SpeechToTextProvider,
    private val countRepository: CountRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CountUiState())
    val uiState: StateFlow<CountUiState> = _uiState.asStateFlow()

    private var countId: String? = null
    private var listenJob: Job? = null

    // ---------- Start count for a scanned shelf ----------
    fun startCount(locationBarcode: String) {
        if (_uiState.value.isStarting) return
        val barcode = locationBarcode.trim()
        if (barcode.isBlank()) return
        _uiState.update { it.copy(isStarting = true, error = null) }
        viewModelScope.launch {
            when (val result = countRepository.start(barcode)) {
                is ApiResult.Success -> {
                    countId = result.data.countId
                    _uiState.update {
                        it.copy(
                            isStarting = false,
                            phase = CountPhase.COUNTING,
                            locationName = result.data.location?.name ?: barcode,
                            items = emptyList(),
                        )
                    }
                }
                ApiResult.Unauthorized -> failStart("نشست شما منقضی شده. دوباره وارد شوید")
                is ApiResult.NetworkError -> failStart("اتصال به سرور برقرار نشد. شبکه را بررسی کنید")
                is ApiResult.ServerError -> failStart(result.message)
            }
        }
    }

    private fun failStart(message: String) {
        _uiState.update { it.copy(isStarting = false, error = message) }
    }

    // ---------- Speech ----------
    fun startListening() {
        if (_uiState.value.isListening) return
        _uiState.update { it.copy(isListening = true, partialText = "", error = null) }
        listenJob = viewModelScope.launch {
            speech.transcribe().collect { event ->
                when (event) {
                    is SttEvent.Partial ->
                        _uiState.update { it.copy(partialText = event.text) }

                    is SttEvent.Final -> {
                        _uiState.update { it.copy(isListening = false, partialText = "") }
                        if (event.text.isNotBlank()) submitItem(event.text)
                    }

                    is SttEvent.Error ->
                        _uiState.update {
                            it.copy(isListening = false, partialText = "", error = messageFor(event.kind))
                        }
                }
            }
        }
    }

    fun stopListening() {
        listenJob?.cancel()
        listenJob = null
        _uiState.update { it.copy(isListening = false) }
    }

    // ---------- Submit a spoken/typed count item ----------
    fun submitItem(text: String) {
        val id = countId ?: return
        val trimmed = text.trim()
        if (trimmed.isBlank()) return
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = countRepository.addVoiceItem(id, trimmed)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(isSubmitting = false, items = listOf(toItem(result.data, trimmed)) + it.items)
                }
                ApiResult.Unauthorized -> failSubmit("نشست شما منقضی شده")
                is ApiResult.NetworkError -> failSubmit("اتصال به سرور برقرار نشد")
                is ApiResult.ServerError -> failSubmit(result.message)
            }
        }
    }

    private fun toItem(dto: CountVoiceResponse, fallbackText: String): CountedItem = CountedItem(
        name = dto.matchedProduct?.name ?: dto.item?.name ?: fallbackText,
        goodQuantity = dto.item?.goodQuantity ?: 0,
        badQuantity = dto.item?.badQuantity ?: 0,
        reviewStatus = dto.reviewStatus,
        matched = dto.matched,
    )

    private fun failSubmit(message: String) {
        _uiState.update { it.copy(isSubmitting = false, error = message) }
    }

    // ---------- Change shelf ----------
    fun changeShelf() {
        countId = null
        listenJob?.cancel()
        _uiState.value = CountUiState()
    }

    private fun messageFor(kind: SttError): String = when (kind) {
        SttError.NO_PERMISSION -> "دسترسی به میکروفون داده نشده است"
        SttError.NO_NETWORK -> "برای تشخیص گفتار به اینترنت نیاز است. متن را دستی وارد کنید"
        SttError.NO_SPEECH -> "صدایی شنیده نشد. دوباره تلاش کنید"
        SttError.UNAVAILABLE -> "تشخیص گفتار روی این دستگاه در دسترس نیست"
        SttError.ENGINE_FAILURE -> "خطا در تشخیص گفتار. دوباره تلاش کنید"
    }

    override fun onCleared() {
        listenJob?.cancel()
        super.onCleared()
    }
}
