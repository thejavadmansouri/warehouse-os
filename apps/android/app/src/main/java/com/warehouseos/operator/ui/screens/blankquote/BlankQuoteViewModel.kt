package com.warehouseos.operator.ui.screens.blankquote

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.remote.dto.BlankQuotationLineRequest
import com.warehouseos.operator.data.remote.dto.CreateBlankQuotationRequest
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.search.LocalVoiceParser
import com.warehouseos.operator.data.search.PersianText
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import com.warehouseos.operator.data.speech.SttEvent
import com.warehouseos.operator.data.speech.toUserMessage
import com.warehouseos.operator.data.sync.SyncRequester
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * یک قلمِ برگه‌ی سفید، همان‌طور که کارگر می‌بیند و ویرایش می‌کند.
 *
 * `key` جدا از متن است تا ویرایشِ متنِ یک ردیف، هویتِ همان ردیف را عوض نکند.
 */
data class BlankLine(
    val key: String,
    val text: String,
    val quantity: Int,
    val suggestedPrice: Int? = null,
)

data class BlankQuoteUiState(
    /** ردیف‌های آماده — دستی یا با صدا اضافه شده‌اند. */
    val lines: List<BlankLine> = emptyList(),
    /** فرمِ ردیفِ بعدی: متن، تعداد و قیمت پیشنهادیِ اختیاری. */
    val draftText: String = "",
    val draftQuantity: String = "1",
    val draftPrice: String = "",
    val customerName: String = "",
    val listening: Boolean = false,
    val partialText: String = "",
    val error: String? = null,
    val submitting: Boolean = false,
    /** پیام کوتاهِ پس از ثبت («ثبت شد — در انتظار ارسال»). */
    val notice: String? = null,
    /** برگه‌های همین دستگاه که هنوز نرفته‌اند یا سرور ردشان کرده. */
    val pendingOfThisDevice: List<OutboxEntity> = emptyList(),
)

/**
 * پیش‌فاکتور سفید — برگه‌ی قیمتِ متنی.
 *
 * منطق صفحه، به‌ترتیب اهمیت:
 *
 *  ۱. **قیمت نهایی را این صفحه نمی‌گیرد.** قیمتی که اینجا زده می‌شود «پیشنهادی»
 *     است و سرور هم آن را در جمع نمی‌آورد؛ مدیر در پنل قیمت می‌گذارد. چون کارگر
 *     کف انبار قیمت را نمی‌داند و نباید برای پرسیدنش بلوکه شود.
 *  ۲. **صدا فقط نام و تعداد می‌گیرد** («سه تا لنت پراید») و میکروفن بین ردیف‌ها
 *     باز می‌ماند، چون برگه معمولاً چند قلم است و بستنِ میکروفن یعنی هر قلم یک
 *     تپ اضافه.
 *  ۳. **آفلاین‌محور**: ثبت یعنی نوشتن در outbox و درخواست سینک. کارگر در انبار
 *     بدون آنتن هم می‌تواند برگه بسازد؛ تا برگشت به وای‌فای مغازه می‌ماند.
 */
@HiltViewModel
class BlankQuoteViewModel @Inject constructor(
    private val speech: SpeechToTextProvider,
    private val outboxRepository: OutboxRepository,
    private val syncRequester: SyncRequester,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BlankQuoteUiState())
    val uiState: StateFlow<BlankQuoteUiState> = _uiState.asStateFlow()

    private var listenJob: Job? = null

    init {
        // برگه‌های نفرستاده‌ی همین دستگاه، زنده از صف.
        viewModelScope.launch {
            outboxRepository.unsyncedBlankQuotations().collect { rows ->
                _uiState.update { it.copy(pendingOfThisDevice = rows) }
            }
        }
    }

    // ---------- فرمِ ردیف ----------

    fun onDraftText(value: String) = _uiState.update { it.copy(draftText = value, error = null) }

    fun onDraftQuantity(value: String) = _uiState.update { it.copy(draftQuantity = value) }

    fun onDraftPrice(value: String) = _uiState.update { it.copy(draftPrice = value) }

    fun onCustomerName(value: String) = _uiState.update { it.copy(customerName = value) }

    /** ردیفِ فرم را به فهرست اضافه می‌کند. متنِ خالی معنی ندارد، بقیه پیش‌فرض می‌گیرد. */
    fun addDraft() {
        val text = _uiState.value.draftText.trim()
        if (text.isEmpty()) {
            _uiState.update { it.copy(error = "نام کالا را بنویسید یا بگویید") }
            return
        }
        addLine(text = text, quantity = parseQuantity(_uiState.value.draftQuantity), price = parsePrice(_uiState.value.draftPrice))
        _uiState.update { it.copy(draftText = "", draftQuantity = "1", draftPrice = "", error = null) }
    }

    fun removeLine(key: String) = _uiState.update { state ->
        state.copy(lines = state.lines.filterNot { it.key == key })
    }

    // ---------- صدا ----------

    /**
     * شروعِ شنیدن. بعد از هر قلم دوباره روشن می‌شود تا چند قلم پشت‌سرهم گفته شود؛
     * `stopListening` تنها راهِ پایان دادن است.
     */
    fun startListening() {
        if (_uiState.value.listening) return
        _uiState.update { it.copy(listening = true, partialText = "", error = null) }
        listenOnce()
    }

    private fun listenOnce() {
        listenJob = viewModelScope.launch {
            var saidSomething = false

            speech.transcribe().collect { event ->
                when (event) {
                    is SttEvent.Partial -> _uiState.update { it.copy(partialText = event.text) }

                    is SttEvent.Final -> {
                        saidSomething = true
                        _uiState.update { it.copy(partialText = "") }
                        addFromTranscript(event.text)
                    }

                    is SttEvent.Error -> _uiState.update {
                        it.copy(
                            listening = false,
                            partialText = "",
                            error = event.kind.toUserMessage(),
                        )
                    }
                }
            }

            /*
             * یک `transcribe()` = یک گفتار. اگر گفتار نتیجه داد و کارگر میکروفن را
             * نبسته، دوباره گوش می‌دهیم؛ اگر هیچی گفته نشد (سکوت/خطا)، خاموش
             * می‌شویم تا حلقه‌ی بی‌پایان نسازیم.
             */
            if (saidSomething && _uiState.value.listening && _uiState.value.error == null) {
                listenOnce()
            } else if (_uiState.value.error == null) {
                _uiState.update { it.copy(listening = false) }
            }
        }
    }

    fun stopListening() {
        listenJob?.cancel()
        listenJob = null
        _uiState.update { it.copy(listening = false, partialText = "") }
    }

    /**
     * متنِ گفتار → یک ردیف.
     *
     * تعداد و واحد با همان پارسر موجودِ اپ جدا می‌شوند (`LocalVoiceParser`) و
     * باقیِ متن، **بدون هیچ جست‌وجویی در کاتالوگ**، نامِ آزادِ قلم می‌شود — چون
     * معنای برگه‌ی سفید همین است. اگر عیناً همان متن قبلاً اضافه شده باشد، تعداد
     * همان ردیف زیاد می‌شود تا فهرست تکراری نشود.
     */
    private fun addFromTranscript(transcript: String) {
        if (transcript.isBlank()) return
        val parsed = LocalVoiceParser.parse(transcript)
        val text = parsed.productQuery.trim().ifBlank { transcript.trim() }
        if (text.isEmpty()) return
        addLine(text = text, quantity = parsed.quantity.coerceIn(1, MAX_QTY), price = null)
    }

    // ---------- ثبت ----------

    /**
     * ثبتِ برگه — local-first.
     *
     * اول در صفِ محلی می‌نشیند و بعد سینک درخواست می‌شود. اگر سرور در دسترس
     * نباشد هیچ خطایی به کارگر نشان داده نمی‌شود، چون برگه ساخته شده و سالم است؛
     * فقط در «در انتظار ارسال» می‌ماند.
     */
    fun submit() {
        val state = _uiState.value
        if (state.submitting) return

        if (state.lines.isEmpty()) {
            _uiState.update { it.copy(error = "حداقل یک قلم لازم است") }
            return
        }

        _uiState.update { it.copy(submitting = true, error = null) }

        viewModelScope.launch {
            val request = CreateBlankQuotationRequest(
                clientRequestId = UUID.randomUUID().toString(),
                customerName = state.customerName.trim().ifBlank { null },
                lines = state.lines.map { line ->
                    BlankQuotationLineRequest(
                        text = line.text,
                        quantity = line.quantity,
                        suggestedPrice = line.suggestedPrice,
                    )
                },
            )

            outboxRepository.enqueueBlankQuotation(request)
            syncRequester.requestSync()

            _uiState.update {
                it.copy(
                    lines = emptyList(),
                    customerName = "",
                    submitting = false,
                    notice = "برگه ثبت شد — در انتظار ارسال به سرور",
                )
            }
        }
    }

    fun dismissNotice() = _uiState.update { it.copy(notice = null) }

    /** حذفِ یک برگه‌ی نفرستاده — اشتباهِ گفتاری، پیش از آنکه به مدیر برسد. */
    fun discardPending(clientRequestId: String) {
        viewModelScope.launch {
            outboxRepository.discard(clientRequestId)
        }
    }

    // ---------- کمکی‌ها ----------

    private fun addLine(text: String, quantity: Int, price: Int?) {
        _uiState.update { state ->
            val normalized = PersianText.normalize(text).trim()
            val index = state.lines.indexOfFirst { PersianText.normalize(it.text).trim() == normalized }

            val lines = if (index >= 0 && price == null) {
                state.lines.toMutableList().also { list ->
                    val existing = list[index]
                    list[index] = existing.copy(
                        quantity = (existing.quantity + quantity).coerceAtMost(MAX_QTY),
                    )
                }
            } else {
                state.lines + BlankLine(
                    key = UUID.randomUUID().toString(),
                    text = text,
                    quantity = quantity.coerceIn(1, MAX_QTY),
                    suggestedPrice = price,
                )
            }

            state.copy(lines = lines, error = null)
        }
    }

    /** «۱۲» و «12» هر دو ۱۲ می‌شوند؛ خالی یعنی ۱. */
    private fun parseQuantity(raw: String): Int =
        PersianText.normalize(raw).filter { it.isDigit() }.take(4).toIntOrNull()?.coerceIn(1, MAX_QTY) ?: 1

    /** قیمت پیشنهادی اختیاری؛ خالی یعنی هیچ عددی. */
    private fun parsePrice(raw: String): Int? =
        PersianText.normalize(raw).filter { it.isDigit() }.take(15).toIntOrNull()

    private companion object {
        const val MAX_QTY = 9999
    }
}
