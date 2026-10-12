package com.warehouseos.operator.ui.screens.voice

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.photo.PhotoStore
import com.warehouseos.operator.data.repository.AuthRepository
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

/**
 * Steps of the capture loop. There is deliberately no SUCCESS step: a saved item
 * drops the worker straight back to INPUT with a transient notice, so a shelf of
 * 50 items costs 50 confirmations instead of 100 taps.
 *
 * PREVIEWING = brief «در حال جستجو» while the offline catalog is queried.
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
    val photoCount: Int,
    /**
     * مدیر/مدیرکل: بعد از سینک، موجودی و صف چاپ قطعی می‌شود.
     * کارگر: منتظر تأیید مدیر در وب می‌ماند.
     */
    val commitsDirectly: Boolean = false,
    /** Set once undo has been attempted, so the UI stops offering it. */
    val undoResult: String? = null,
) {
    val withPhoto: Boolean get() = photoCount > 0
}

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
    /**
     * متن جست‌وجو در مرحله‌ی انتخاب.
     *
     * در state است نه داخل خودِ صفحه، چون حالا دو منبع دارد — تایپ و صدا — و
     * اگر محلی بماند، چیزی که کارگر می‌گوید در کادر دیده نمی‌شود.
     */
    val searchQuery: String = "",
    /** مسیر فایل‌های فشرده‌شدهٔ عکس‌های این ثبت (حداکثر [MAX_PHOTOS]). */
    val photoPaths: List<String> = emptyList(),
    /** دوربین داخل‌اپ برای عکس کالا باز است. */
    val capturingPhoto: Boolean = false,
    /** اگر ست باشد، عکس بعدی به این ثبت قبلی قفسه وصل می‌شود. */
    val attachingToEntryId: String? = null,
    val photoBusy: Boolean = false,
    val lastSaved: SavedNotice? = null,
    /**
     * Everything registered on THIS shelf during this visit, newest first.
     *
     * Without it the worker has no way to check what they just entered without
     * leaving the screen, which is the most common "did that go through?" moment
     * on the floor. In-memory only: it describes the current shelf visit, not
     * durable state — the outbox already owns durability.
     */
    val shelfEntries: List<SavedNotice> = emptyList(),
    val error: String? = null,
    // Parsed voice fields, kept so a "new product request" can be pre-filled.
    val recognizedName: String = "",
    val recognizedBrand: String = "",
    val recognizedVehicle: String = "",
    /** دوربینِ اسکنِ بارکدِ کالا باز است. */
    val scanning: Boolean = false,
    /**
     * بارکدی که اسکن شد ولی هیچ کالایی نداشت.
     *
     * نگه داشته می‌شود تا وقتی کارگر کالا را با صدا یا جست‌وجو مشخص کرد، همان
     * لحظه به آن کالا وصل شود — بی‌آنکه لازم باشد بعداً از ابزارِ جدا دوباره
     * همان جعبه را بردارد و اسکن کند.
     */
    val unlinkedBarcode: String? = null,
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
    private val authRepository: AuthRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    val barcode: String = savedState.get<String>(Routes.ARG_BARCODE).orEmpty()

    private val _uiState = MutableStateFlow(
        VoiceUiState(photoPaths = restoredPhotoPaths()),
    )
    val uiState: StateFlow<VoiceUiState> = _uiState.asStateFlow()

    /** Photos still waiting for a Wi-Fi window — shown in the header. */
    val pendingPhotoCount: StateFlow<Int> = photoRepository.pendingCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private var listenJob: Job? = null
    private var searchJob: Job? = null
    private var matchJob: Job? = null
    private var noticeJob: Job? = null
    private var pendingProductId: String? = null

    // ---------- Speech to text ----------
    fun startListening() {
        if (_uiState.value.isListening) return
        if (_uiState.value.capturingPhoto) return
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
                        if (event.text.isNotBlank()) resolveProduct()
                    }

                    is SttEvent.Error ->
                        _uiState.update {
                            it.copy(isListening = false, partialText = "", error = event.kind.toUserMessage())
                        }
                }
            }
        }
    }

    /**
     * صدا در مرحله‌ی انتخاب.
     *
     * عمداً از [startListening] جداست: آن یکی نتیجه را به تطبیق‌گر می‌دهد و
     * می‌تواند مرحله را عوض کند، در حالی که اینجا کارگر دارد همان لیست را فیلتر
     * می‌کند و باید سرِ جایش بماند. بدون این، تنها راهِ ورودِ این صفحه — همان
     * لحظه‌ای که جعبه دستِ کارگر است — تایپ بود.
     */
    fun startListeningForSearch() {
        if (_uiState.value.isListening) return
        _uiState.update { it.copy(isListening = true, partialText = "", error = null) }
        listenJob = viewModelScope.launch {
            speech.transcribe().collect { event ->
                when (event) {
                    is SttEvent.Partial ->
                        _uiState.update { it.copy(partialText = event.text) }

                    is SttEvent.Final -> {
                        _uiState.update { it.copy(isListening = false, partialText = "") }
                        if (event.text.isNotBlank()) {
                            val spoken = LocalVoiceParser.parse(event.text)
                            val query = spoken.productQuery.ifBlank { event.text }
                            onSearchQuery(query)
                        }
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
    fun resolveProduct() {
        val text = _uiState.value.transcript.trim()
        if (text.isBlank()) return
        // STT بعد از Final خودش resolve می‌زند؛ اگر کارگر همان لحظه «بررسی و ادامه»
        // را هم بزند، نباید جستجوی در حال اجرا را cancel کنیم — قبلاً catch(Throwable)
        // CancellationException را قورت می‌داد و نتیجهٔ SELECT را به INPUT برمی‌گرداند.
        if (_uiState.value.phase == VoicePhase.PREVIEWING) return

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

        _uiState.update {
            it.copy(
                phase = VoicePhase.PREVIEWING,
                quantity = parsed.quantity,
                unit = parsed.unit,
                error = null,
            )
        }
        matchJob?.cancel()
        matchJob = viewModelScope.launch {
            try {
                applyHits(catalogRepository.search(parsed.productQuery), parsed)
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.INPUT,
                        error = "جستجو روی گوشی قطع شد — متن را کوتاه‌تر تایپ کنید یا دوباره بزنید",
                    )
                }
            }
        }
    }

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

    fun selectChoice(choice: ProductChoice) {
        pendingProductId = choice.id

        val pendingBarcode = _uiState.value.unlinkedBarcode
        if (pendingBarcode != null) {
            viewModelScope.launch {
                outboxRepository.enqueueBarcodeLink(choice.id, pendingBarcode)
                catalogRepository.addBarcodeLocally(choice.id, pendingBarcode)
            }
        }

        _uiState.update {
            it.copy(
                phase = VoicePhase.CONFIRM,
                proposalName = choice.name,
                unit = it.unit ?: choice.unit,
                unlinkedBarcode = null,
                error = null,
            )
        }
    }

    fun onSearchQuery(query: String) {
        searchJob?.cancel()
        val q = query.trim()
        _uiState.update { it.copy(searchQuery = query) }
        if (q.length < 2) {
            _uiState.update { it.copy(searchResults = emptyList()) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(60)
            val hits = runCatching { catalogRepository.search(q) }.getOrDefault(emptyList())
            _uiState.update { state -> state.copy(searchResults = hits.map { it.toChoice() }) }
        }
    }

    fun incQuantity() = _uiState.update {
        it.copy(quantity = (it.quantity + 1).coerceAtMost(MAX_QTY))
    }

    fun decQuantity() = _uiState.update {
        it.copy(quantity = (it.quantity - 1).coerceAtLeast(1))
    }

    // ---------- Photo (multi, CameraX, compress at capture) ----------

    fun createCaptureFile(): File = photoStore.createCaptureFile()

    fun openCamera(forEntryId: String? = null) {
        stopListening()
        val state = _uiState.value
        val currentCount = if (forEntryId != null) {
            state.shelfEntries.find { it.clientRequestId == forEntryId }?.photoCount
                ?: state.lastSaved?.takeIf { it.clientRequestId == forEntryId }?.photoCount
                ?: 0
        } else {
            state.photoPaths.size
        }
        if (currentCount >= MAX_PHOTOS) {
            _uiState.update { it.copy(error = "حداکثر $MAX_PHOTOS عکس برای هر کالا") }
            return
        }
        _uiState.update {
            it.copy(
                capturingPhoto = true,
                attachingToEntryId = forEntryId,
                error = null,
            )
        }
    }

    fun closeCamera() {
        _uiState.update {
            it.copy(capturingPhoto = false, attachingToEntryId = null, photoBusy = false)
        }
    }

    /** فایل خام از CameraX؛ همان‌جا فشرده می‌شود تا تأیید سبک بماند. */
    fun onCaptureFile(raw: File) {
        viewModelScope.launch {
            _uiState.update { it.copy(photoBusy = true) }
            val compressed = withContext(Dispatchers.IO) {
                val out = photoStore.compress(Uri.fromFile(raw))
                photoStore.deleteCapture(raw)
                out
            }
            if (compressed == null) {
                _uiState.update {
                    it.copy(photoBusy = false, error = "عکس خوانده نشد — دوباره بگیرید")
                }
                return@launch
            }

            val entryId = _uiState.value.attachingToEntryId
            if (entryId != null) {
                val ok = photoRepository.attachReady(entryId, compressed)
                _uiState.update { state ->
                    val entries = if (ok) {
                        state.shelfEntries.map { e ->
                            if (e.clientRequestId == entryId) {
                                e.copy(photoCount = (e.photoCount + 1).coerceAtMost(MAX_PHOTOS))
                            } else {
                                e
                            }
                        }
                    } else {
                        state.shelfEntries
                    }
                    val entryCount =
                        entries.find { it.clientRequestId == entryId }?.photoCount ?: 0
                    state.copy(
                        photoBusy = false,
                        // چند عکس پشت‌سرهم برای ثبت قبلی؛ با «تمام» یا سقف بسته می‌شود.
                        capturingPhoto = ok && entryCount < MAX_PHOTOS,
                        attachingToEntryId = if (ok && entryCount < MAX_PHOTOS) entryId else null,
                        shelfEntries = entries,
                        lastSaved = state.lastSaved?.let { notice ->
                            if (notice.clientRequestId == entryId && ok) {
                                notice.copy(photoCount = entryCount)
                            } else {
                                notice
                            }
                        },
                        error = if (ok) null else "عکس به صف اضافه نشد",
                    )
                }
                return@launch
            }

            _uiState.update { state ->
                val next = (state.photoPaths + compressed.absolutePath).take(MAX_PHOTOS)
                persistPhotoPaths(next)
                state.copy(
                    photoPaths = next,
                    photoBusy = false,
                    capturingPhoto = next.size < MAX_PHOTOS,
                    error = null,
                )
            }
        }
    }

    fun removePhotoAt(index: Int) {
        _uiState.update { state ->
            val path = state.photoPaths.getOrNull(index) ?: return@update state
            photoStore.delete(path)
            val next = state.photoPaths.filterIndexed { i, _ -> i != index }
            persistPhotoPaths(next)
            state.copy(photoPaths = next)
        }
    }

    fun clearPhotos() {
        _uiState.value.photoPaths.forEach(photoStore::delete)
        persistPhotoPaths(emptyList())
        _uiState.update { it.copy(photoPaths = emptyList()) }
    }

    // ---------- Confirm = enqueue locally (offline-first) ----------
    fun confirm() {
        val productId = pendingProductId ?: return
        val state = _uiState.value
        val quantity = state.quantity
        val name = state.proposalName.ifBlank { "کالا" }
        val photos = state.photoPaths.toList()

        viewModelScope.launch {
            val clientRequestId = outboxRepository.enqueue(
                type = "IN",
                locationBarcode = barcode,
                voiceText = state.transcript.ifBlank { null },
                productId = productId,
                quantity = quantity,
                unit = state.unit,
            )

            pendingProductId = null
            persistPhotoPaths(emptyList())

            val previousEntries = _uiState.value.shelfEntries
            val notice = SavedNotice(
                clientRequestId = clientRequestId,
                productName = name,
                quantity = quantity,
                photoCount = photos.size,
                commitsDirectly = authRepository.cachedUser()?.commitsStockDirectly == true,
            )

            // فوری برگرد به INPUT — فشرده‌سازی قبلاً شده؛ صف عکس پس‌زمینه است.
            _uiState.value = VoiceUiState(
                lastSaved = notice,
                shelfEntries = listOf(notice) + previousEntries,
            )
            scheduleNoticeDismiss()
            syncScheduler.requestSync()

            if (photos.isNotEmpty()) {
                launch(Dispatchers.IO) {
                    for (path in photos) {
                        val file = File(path)
                        if (!photoRepository.attachReady(clientRequestId, file)) {
                            // attachReady owns the file on success; on failure keep for retry? delete to avoid leak
                            if (file.exists()) {
                                // re-try once via attach (re-compress from same jpeg is fine)
                                photoRepository.attach(clientRequestId, Uri.fromFile(file))
                            }
                        }
                    }
                }
            }
        }
    }

    fun undoLastSaved() {
        val saved = _uiState.value.lastSaved ?: return
        noticeJob?.cancel()
        viewModelScope.launch {
            val removed = outboxRepository.discard(saved.clientRequestId)
            _uiState.update {
                it.copy(
                    shelfEntries = if (removed) {
                        it.shelfEntries.filterNot { e -> e.clientRequestId == saved.clientRequestId }
                    } else {
                        it.shelfEntries
                    },
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

    fun cancelToInput() {
        pendingProductId = null
        clearPhotos()
        _uiState.update {
            it.copy(
                phase = VoicePhase.INPUT,
                capturingPhoto = false,
                attachingToEntryId = null,
                error = null,
                choices = emptyList(),
                searchResults = emptyList(),
                selectionMessage = null,
            )
        }
    }

    fun prewarmMic() = speech.prewarm()

    fun openScanner() = _uiState.update { it.copy(scanning = true, error = null) }

    fun closeScanner() = _uiState.update { it.copy(scanning = false) }

    fun onProductBarcode(raw: String) {
        val code = raw.trim()
        if (code.isEmpty()) return

        viewModelScope.launch {
            val match = catalogRepository.findByBarcode(code)

            if (match != null) {
                pendingProductId = match.id
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.CONFIRM,
                        scanning = false,
                        unlinkedBarcode = null,
                        proposalName = match.name,
                        unit = match.unit,
                        quantity = 1,
                        error = null,
                    )
                }
            } else {
                pendingProductId = null
                _uiState.update {
                    it.copy(
                        phase = VoicePhase.SELECT,
                        scanning = false,
                        unlinkedBarcode = code,
                        selectionMessage = "این بارکد ثبت نشده — کالایش را پیدا کن تا وصل شود",
                        choices = emptyList(),
                        searchResults = emptyList(),
                        error = null,
                    )
                }
            }
        }
    }

    fun searchManually() {
        pendingProductId = null
        _uiState.update {
            it.copy(
                phase = VoicePhase.SELECT,
                selectionMessage = "کالای موردنظر را جستجو کنید",
                choices = emptyList(),
                searchResults = emptyList(),
                searchQuery = "",
                error = null,
            )
        }
    }

    private fun restoredPhotoPaths(): List<String> =
        savedState.get<String>(KEY_PHOTO_PATHS)
            ?.split(PATH_SEP)
            ?.filter { it.isNotBlank() && File(it).exists() }
            .orEmpty()

    private fun persistPhotoPaths(paths: List<String>) {
        savedState[KEY_PHOTO_PATHS] = paths.joinToString(PATH_SEP)
    }

    override fun onCleared() {
        listenJob?.cancel()
        searchJob?.cancel()
        matchJob?.cancel()
        noticeJob?.cancel()
        super.onCleared()
    }

    companion object {
        const val MAX_PHOTOS = 4
        private const val KEY_PHOTO_PATHS = "pending_photo_paths"
        private const val PATH_SEP = "\u0001"
        private const val MAX_QTY = 9999
        private const val NOTICE_MS = 4_000L
    }
}
