package com.warehouseos.operator.ui.screens.voice

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.VoiceResponseDto
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.repository.SessionRepository
import com.warehouseos.operator.data.repository.VoiceRepository
import com.warehouseos.operator.data.sync.SyncScheduler
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import com.warehouseos.operator.data.speech.SttError
import com.warehouseos.operator.data.speech.SttEvent
import com.warehouseos.operator.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

enum class VoicePhase { INPUT, PREVIEWING, CONFIRM, SELECT, SUBMITTING, SUCCESS }

data class ProductChoice(val id: String, val name: String, val sku: String?)

data class VoiceUiState(
    val isListening: Boolean = false,
    val partialText: String = "",
    val transcript: String = "",
    val phase: VoicePhase = VoicePhase.INPUT,
    val proposalName: String = "",
    val quantity: Int = 1,
    val unit: String? = null,
    val selectionMessage: String? = null,
    val choices: List<ProductChoice> = emptyList(),
    val searchResults: List<ProductChoice> = emptyList(),
    val successText: String? = null,
    val error: String? = null,
)

/**
 * Voice stock-in flow. STT → server `preview` proposes a product (no commit) →
 * worker confirms. Confirm now writes to the local OUTBOX (offline-first) and
 * triggers a background sync; stock is applied only after a manager approves.
 */
@HiltViewModel
class VoiceEntryViewModel @Inject constructor(
    private val speech: SpeechToTextProvider,
    private val voiceRepository: VoiceRepository,
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
    private val syncScheduler: SyncScheduler,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val barcode: String = savedStateHandle.get<String>(Routes.ARG_BARCODE).orEmpty()

    private val _uiState = MutableStateFlow(VoiceUiState())
    val uiState: StateFlow<VoiceUiState> = _uiState.asStateFlow()

    private var listenJob: Job? = null
    private var searchJob: Job? = null
    private var pendingProductId: String? = null

    // ---------- Speech to text ----------
    fun startListening() {
        if (_uiState.value.isListening) return
        _uiState.update { it.copy(isListening = true, partialText = "", error = null) }
        listenJob = viewModelScope.launch {
            speech.transcribe().collect { event ->
                when (event) {
                    is SttEvent.Partial ->
                        _uiState.update { it.copy(partialText = event.text) }

                    is SttEvent.Final -> {
                        _uiState.update {
                            it.copy(isListening = false, partialText = "", transcript = event.text)
                        }
                        if (event.text.isNotBlank()) runPreview() // fast path; confirm screen is the safety gate
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

    fun onTranscriptChange(text: String) {
        _uiState.update { it.copy(transcript = text, error = null) }
    }

    // ---------- Preview (propose, no commit) ----------
    fun runPreview() {
        val text = _uiState.value.transcript.trim()
        if (text.isBlank()) return
        val sessionId = sessionRepository.sessionId.value
        if (sessionId.isNullOrBlank()) {
            _uiState.update { it.copy(error = "شیفت فعال نیست. به صفحه‌ی اصلی برگردید") }
            return
        }
        _uiState.update { it.copy(phase = VoicePhase.PREVIEWING, error = null) }
        viewModelScope.launch {
            when (val result = voiceRepository.preview(barcode, text, sessionId)) {
                is ApiResult.Success -> applyPreview(result.data)
                ApiResult.Unauthorized -> failInput("نشست شما منقضی شده. دوباره وارد شوید")
                is ApiResult.NetworkError -> failInput("اتصال به سرور برقرار نشد. شبکه را بررسی کنید")
                is ApiResult.ServerError -> failInput(result.message)
            }
        }
    }

    private fun applyPreview(dto: VoiceResponseDto) {
        val qty = dto.extractQuantity()
        val unit = dto.extractUnit()
        when {
            dto.success && dto.needConfirm == true && dto.product != null -> {
                pendingProductId = dto.product.id
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.CONFIRM,
                        proposalName = dto.product.name,
                        quantity = qty,
                        unit = unit,
                        error = null,
                    )
                }
            }

            dto.needSelection == true -> {
                pendingProductId = null
                val choices = dto.suggestions.orEmpty().mapNotNull { s ->
                    s.product?.let { ProductChoice(it.id, it.name, it.sku) }
                }
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.SELECT,
                        selectionMessage = dto.message ?: "محصول را انتخاب کنید",
                        choices = choices,
                        searchResults = emptyList(),
                        quantity = qty,
                        unit = unit,
                        error = null,
                    )
                }
            }

            else -> failInput("پاسخ نامعتبر از سرور")
        }
    }

    private fun failInput(message: String) {
        _uiState.update { it.copy(phase = VoicePhase.INPUT, error = message) }
    }

    // ---------- Manual selection / search ----------
    fun selectChoice(choice: ProductChoice) {
        pendingProductId = choice.id
        _uiState.update { it.copy(proposalName = choice.name) }
        confirm()
    }

    fun onSearchQuery(query: String) {
        searchJob?.cancel()
        if (query.isBlank()) {
            _uiState.update { it.copy(searchResults = emptyList()) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(350) // debounce
            when (val result = voiceRepository.search(query.trim())) {
                is ApiResult.Success ->
                    _uiState.update {
                        it.copy(searchResults = result.data.map { p -> ProductChoice(p.id, p.name, p.sku) })
                    }
                else -> Unit // search failures stay quiet; the list just doesn't update
            }
        }
    }

    // ---------- Confirm = enqueue locally (offline-first) ----------
    // Writes to the outbox and triggers a background sync. Stock is applied only
    // after a manager approves — so a worker is never blocked by connectivity.
    fun confirm() {
        val productId = pendingProductId ?: return
        val qty = _uiState.value.quantity
        val name = _uiState.value.proposalName.ifBlank { "کالا" }
        _uiState.update { it.copy(phase = VoicePhase.SUBMITTING, error = null) }
        viewModelScope.launch {
            outboxRepository.enqueue(
                type = "IN",
                locationBarcode = barcode,
                voiceText = _uiState.value.transcript.ifBlank { null },
                productId = productId,
                quantity = qty,
                unit = _uiState.value.unit,
            )
            syncScheduler.requestSync()
            _uiState.update {
                it.copy(
                    phase = VoicePhase.SUCCESS,
                    successText = "$name × $qty در صف ثبت شد — پس از تأیید مدیر اعمال می‌شود",
                )
            }
        }
    }

    private fun failConfirm(message: String) {
        val back = if (_uiState.value.choices.isNotEmpty()) VoicePhase.SELECT else VoicePhase.CONFIRM
        _uiState.update { it.copy(phase = back, error = message) }
    }

    // ---------- Reset helpers ----------
    fun cancelToInput() {
        pendingProductId = null
        _uiState.update {
            it.copy(
                phase = VoicePhase.INPUT,
                error = null,
                choices = emptyList(),
                searchResults = emptyList(),
                selectionMessage = null,
            )
        }
    }

    /** Same shelf, next item — clear the transcript and proposal. */
    fun nextItem() {
        pendingProductId = null
        listenJob?.cancel()
        _uiState.value = VoiceUiState()
    }

    private fun VoiceResponseDto.extractQuantity(): Int =
        quantity ?: parsed?.get("quantity")?.jsonPrimitive?.intOrNull ?: 1

    private fun VoiceResponseDto.extractUnit(): String? =
        parsed?.get("unit")?.jsonPrimitive?.contentOrNull

    private fun messageFor(kind: SttError): String = when (kind) {
        SttError.NO_PERMISSION -> "دسترسی به میکروفون داده نشده است"
        SttError.NO_NETWORK -> "برای تشخیص گفتار به اینترنت نیاز است. متن را دستی وارد کنید"
        SttError.NO_SPEECH -> "صدایی شنیده نشد. دوباره تلاش کنید"
        SttError.UNAVAILABLE -> "تشخیص گفتار روی این دستگاه در دسترس نیست"
        SttError.ENGINE_FAILURE -> "خطا در تشخیص گفتار. دوباره تلاش کنید"
    }

    override fun onCleared() {
        listenJob?.cancel()
        searchJob?.cancel()
        super.onCleared()
    }
}
