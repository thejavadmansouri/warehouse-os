package com.warehouseos.operator.ui.screens.voice

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.photo.PhotoStore
import com.warehouseos.operator.data.repository.CatalogRepository
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.repository.PhotoRepository
import com.warehouseos.operator.data.search.LocalVoiceParser
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import com.warehouseos.operator.data.speech.SttEvent
import com.warehouseos.operator.data.speech.toUserMessage
import com.warehouseos.operator.data.sync.SyncScheduler
import com.warehouseos.operator.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

/**
 * Steps of the capture loop. There is deliberately no SUCCESS step: a saved item
 * drops the worker straight back to INPUT with a transient notice, so a shelf of
 * 50 items costs 50 confirmations instead of 100 taps.
 */
enum class VoicePhase { INPUT, PREVIEWING, CONFIRM, SELECT, NOT_FOUND, SUBMITTING }

data class ProductChoice(
    val id: String,
    val name: String,
    val sku: String?,
    val unit: String? = null,
)

/** Transient "saved" notice with a short undo window. */
data class SavedNotice(
    val clientRequestId: String,
    val productName: String,
    val quantity: Int,
    val withPhoto: Boolean,
    /** Set once undo has been attempted, so the UI stops offering it. */
    val undoResult: String? = null,
)

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
    /** Local path of the captured photo, so the worker can verify it before saving. */
    val photoPath: String? = null,
    val lastSaved: SavedNotice? = null,
    val error: String? = null,
    // Parsed voice fields, kept so a "new product request" can be pre-filled.
    val recognizedName: String = "",
    val recognizedBrand: String = "",
    val recognizedVehicle: String = "",
)

/**
 * Voice stock-in — local-first.
 *
 * Mic → Google STT (needs internet; mobile data is enough) → text → LOCAL parse
 * + LOCAL catalog search → worker confirms → outbox → manager approves.
 *
 * The shop server is deliberately NOT on this path. It lives on the shop LAN, so
 * from mobile data out in the warehouse it is unreachable and asking it first
 * only bought a timeout before falling back to exactly this local match. The raw
 * transcript rides along in the outbox row: the server re-parses and re-matches
 * it at sync time and a manager approves, so the on-device match is an assist,
 * never the source of truth.
 */
@HiltViewModel
class VoiceEntryViewModel @Inject constructor(
    private val speech: SpeechToTextProvider,
    private val outboxRepository: OutboxRepository,
    private val photoRepository: PhotoRepository,
    private val photoStore: PhotoStore,
    private val syncScheduler: SyncScheduler,
    private val catalogRepository: CatalogRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    val barcode: String = savedState.get<String>(Routes.ARG_BARCODE).orEmpty()

    private val _uiState = MutableStateFlow(VoiceUiState())
    val uiState: StateFlow<VoiceUiState> = _uiState.asStateFlow()

    /** Photos still waiting for a Wi-Fi window — shown in the header. */
    val pendingPhotoCount: StateFlow<Int> = photoRepository.pendingCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private var listenJob: Job? = null
    private var searchJob: Job? = null
    private var matchJob: Job? = null
    private var noticeJob: Job? = null
    private var pendingProductId: String? = null

    /**
     * Full-resolution capture, held until the operation exists to attach it to.
     *
     * Kept in [SavedStateHandle], not a plain field: launching the camera puts this
     * app in the background, and on a low-RAM phone the process is often killed
     * there. A plain field would come back null and the photo would be discarded
     * without a word — the exact silent loss this queue exists to prevent.
     */
    private var pendingCaptureFile: File?
        get() = savedState.get<String>(KEY_CAPTURE_PATH)?.let(::File)
        set(value) {
            savedState[KEY_CAPTURE_PATH] = value?.absolutePath
        }

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
                        if (event.text.isNotBlank()) resolveProduct() // confirm step is the safety gate
                    }

                    is SttEvent.Error ->
                        _uiState.update {
                            it.copy(isListening = false, partialText = "", error = event.kind.toUserMessage())
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

    // ---------- Resolve: local parse + local catalog match (no network) ----------
    /**
     * Turns the transcript (spoken or typed) into a product proposal using only
     * on-device data, so this works on mobile data, on the shop Wi-Fi, or with no
     * connectivity at all once the catalog is on the phone.
     */
    fun resolveProduct() {
        val text = _uiState.value.transcript.trim()
        if (text.isBlank()) return

        val parsed = LocalVoiceParser.parse(text)
        if (parsed.productQuery.isBlank()) {
            _uiState.update {
                it.copy(
                    phase = VoicePhase.INPUT,
                    quantity = parsed.quantity,
                    unit = parsed.unit,
                    error = "نام کالا در گفته‌ی شما شنیده نشد — دوباره بگویید یا دستی وارد کنید",
                )
            }
            return
        }

        _uiState.update { it.copy(phase = VoicePhase.PREVIEWING, error = null) }
        matchJob?.cancel()
        matchJob = viewModelScope.launch {
            applyHits(catalogRepository.search(parsed.productQuery), parsed)
        }
    }

    /**
     * One hit → propose it for confirmation. Several → let the worker pick. None →
     * offer manual search / a new-product request. Nothing is ever committed here.
     */
    private fun applyHits(hits: List<CatalogProductEntity>, parsed: LocalVoiceParser.Result) {
        when {
            hits.isEmpty() -> {
                pendingProductId = null
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.NOT_FOUND,
                        quantity = parsed.quantity,
                        unit = parsed.unit,
                        recognizedName = parsed.productQuery,
                        choices = emptyList(),
                        error = null,
                    )
                }
            }

            hits.size == 1 -> {
                val product = hits.first()
                pendingProductId = product.id
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.CONFIRM,
                        proposalName = product.name,
                        quantity = parsed.quantity,
                        unit = parsed.unit ?: product.unit,
                        recognizedName = parsed.productQuery,
                        error = null,
                    )
                }
            }

            else -> {
                pendingProductId = null
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.SELECT,
                        selectionMessage = "چند کالا پیدا شد — مورد درست را انتخاب کنید",
                        choices = hits.map { hit -> hit.toChoice() },
                        searchResults = emptyList(),
                        quantity = parsed.quantity,
                        unit = parsed.unit,
                        recognizedName = parsed.productQuery,
                        error = null,
                    )
                }
            }
        }
    }

    private fun CatalogProductEntity.toChoice() =
        ProductChoice(id = id, name = name, sku = sku, unit = unit)

    // ---------- Manual selection / typed search ----------
    // The always-available fallback: no mic permission, no internet for STT, or
    // speech simply mis-heard — the worker types and the same local engine answers.
    /**
     * Picking from the list moves to CONFIRM rather than saving outright, so the
     * quantity can still be corrected and a photo attached. Committing straight
     * from the list would make both impossible on the multi-match path.
     */
    fun selectChoice(choice: ProductChoice) {
        pendingProductId = choice.id
        _uiState.update {
            it.copy(
                phase = VoicePhase.CONFIRM,
                proposalName = choice.name,
                unit = it.unit ?: choice.unit,
                error = null,
            )
        }
    }

    fun onSearchQuery(query: String) {
        searchJob?.cancel()
        val q = query.trim()
        if (q.length < 2) {
            _uiState.update { it.copy(searchResults = emptyList()) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(150) // debounce — local search is instant, no server round-trip
            val hits = catalogRepository.search(q)
            _uiState.update { state -> state.copy(searchResults = hits.map { it.toChoice() }) }
        }
    }

    // ---------- Quantity ----------
    // Voice mis-hears «سه تا» as «سی تا» often enough that a correction step is
    // mandatory; without it the worker has to redo the whole utterance.
    fun incQuantity() = _uiState.update {
        it.copy(quantity = (it.quantity + 1).coerceAtMost(MAX_QTY))
    }

    fun decQuantity() = _uiState.update {
        it.copy(quantity = (it.quantity - 1).coerceAtLeast(1))
    }

    // ---------- Photo ----------
    /** Creates the capture target and returns the URI the camera writes into. */
    fun prepareCapture(): Uri {
        pendingCaptureFile?.let(photoStore::deleteCapture) // replace an unused one
        val file = photoStore.createCaptureFile()
        pendingCaptureFile = file
        return photoStore.captureUri(file)
    }

    /** Camera returned. [saved] is false when the worker backed out. */
    fun onPhotoCaptured(saved: Boolean) {
        val file = pendingCaptureFile
        if (saved && file != null) {
            _uiState.update { it.copy(photoPath = file.absolutePath) }
        } else {
            clearCapture()
        }
    }

    fun removePhoto() = clearCapture()

    private fun clearCapture() {
        pendingCaptureFile?.let(photoStore::deleteCapture)
        pendingCaptureFile = null
        _uiState.update { it.copy(photoPath = null) }
    }

    // ---------- Confirm = enqueue locally (offline-first) ----------
    // Writes to the outbox and triggers a background sync. Stock is applied only
    // after a manager approves — so a worker is never blocked by connectivity.
    fun confirm() {
        val productId = pendingProductId ?: return
        val state = _uiState.value
        val quantity = state.quantity
        val name = state.proposalName.ifBlank { "کالا" }
        _uiState.update { it.copy(phase = VoicePhase.SUBMITTING, error = null) }

        viewModelScope.launch {
            val clientRequestId = outboxRepository.enqueue(
                type = "IN",
                locationBarcode = barcode,
                // The raw sentence goes with it: the server re-parses and re-matches
                // it at sync time, and the manager reads it while reviewing.
                voiceText = state.transcript.ifBlank { null },
                productId = productId,
                quantity = quantity,
                unit = state.unit,
            )

            // Compress + queue the photo against the operation's idempotency key.
            // A failure here must not lose the operation — it is already captured.
            val capture = pendingCaptureFile
            val photoQueued = if (capture != null) {
                photoRepository.attach(clientRequestId, Uri.fromFile(capture))
                    .also { photoStore.deleteCapture(capture) }
            } else {
                false
            }
            pendingCaptureFile = null
            pendingProductId = null

            syncScheduler.requestSync()

            // Straight back to a clean INPUT, carrying only the transient notice.
            _uiState.value = VoiceUiState(
                lastSaved = SavedNotice(
                    clientRequestId = clientRequestId,
                    productName = name,
                    quantity = quantity,
                    withPhoto = photoQueued,
                ),
            )
            scheduleNoticeDismiss()
        }
    }

    /**
     * Undo is best-effort by design: once the outbox row has synced, the operation
     * lives on the server and only a manager can reverse it. Say so rather than
     * pretending the tap worked.
     */
    fun undoLastSaved() {
        val saved = _uiState.value.lastSaved ?: return
        noticeJob?.cancel()
        viewModelScope.launch {
            val removed = outboxRepository.discard(saved.clientRequestId)
            _uiState.update {
                it.copy(
                    lastSaved = saved.copy(
                        undoResult = if (removed) {
                            "ثبت لغو شد"
                        } else {
                            "به سرور ارسال شده — لغو از پنل مدیر"
                        },
                    ),
                )
            }
            scheduleNoticeDismiss()
        }
    }

    fun dismissSavedNotice() {
        noticeJob?.cancel()
        _uiState.update { it.copy(lastSaved = null) }
    }

    private fun scheduleNoticeDismiss() {
        noticeJob?.cancel()
        noticeJob = viewModelScope.launch {
            delay(NOTICE_MS)
            _uiState.update { it.copy(lastSaved = null) }
        }
    }

    // ---------- Reset helpers ----------
    fun cancelToInput() {
        pendingProductId = null
        clearCapture()
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

    /** Warm the speech engine when the screen opens so the first tap is instant. */
    fun prewarmMic() = speech.prewarm()

    /** From NOT_FOUND: fall back to manual product search (keeps the shelf). */
    fun searchManually() {
        pendingProductId = null
        _uiState.update {
            it.copy(
                phase = VoicePhase.SELECT,
                selectionMessage = "کالای موردنظر را جستجو کنید",
                choices = emptyList(),
                searchResults = emptyList(),
                error = null,
            )
        }
    }

    override fun onCleared() {
        listenJob?.cancel()
        searchJob?.cancel()
        matchJob?.cancel()
        noticeJob?.cancel()
        super.onCleared()
    }

    private companion object {
        const val KEY_CAPTURE_PATH = "pending_capture_path"
        const val MAX_QTY = 9999
        const val NOTICE_MS = 5_000L
    }
}
