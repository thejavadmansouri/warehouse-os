package com.warehouseos.operator.ui.screens.blankquote

import com.warehouseos.operator.data.FakeOutboxDao
import com.warehouseos.operator.data.FakePhotoQueue
import com.warehouseos.operator.data.local.OutboxStatus
import com.warehouseos.operator.data.local.OutboxType
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import com.warehouseos.operator.data.speech.SttCapabilities
import com.warehouseos.operator.data.speech.SttConfig
import com.warehouseos.operator.data.speech.SttError
import com.warehouseos.operator.data.speech.SttEvent
import com.warehouseos.operator.data.sync.SyncRequester
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * تست‌های منطقِ «پیش‌فاکتور سفید» روی گوشی.
 *
 * چیزی که قفل می‌شود:
 *   • صدا فقط نام و تعداد می‌گیرد و **جست‌وجویی در کاتالوگ نمی‌کند** — قلم با
 *     همان متنی که گفته شده ساخته می‌شود، چون معنای «سفید» همین است.
 *   • گفتنِ دوباره‌ی یک قلم، تعداد همان ردیف را زیاد می‌کند (فهرست تکراری نمی‌شود).
 *   • ثبت = یک ردیف در صفِ آفلاین با نوع BLANK_QUOTATION و کلید یکتا؛ و فرم پاک
 *     می‌شود تا برگه‌ی بعدی بی‌دردسر ساخته شود.
 *   • خطای موتور تشخیص گفتار به پیام فارسی قابل‌فهم تبدیل می‌شود.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BlankQuoteViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var server: MockWebServer
    private lateinit var dao: FakeOutboxDao
    private lateinit var outbox: OutboxRepository

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    /** موتور گفتارِ بدل: هر بار `transcribe()` یک «گفتار» از پیش‌تعیین‌شده می‌دهد. */
    private class FakeSpeech(
        private val utterances: MutableList<List<SttEvent>> = mutableListOf(),
    ) : SpeechToTextProvider {
        override val capabilities = SttCapabilities(
            worksOffline = false,
            emitsPartials = true,
            biasable = false,
        )

        var calls = 0
            private set

        fun say(vararg events: SttEvent) {
            utterances += events.toList()
        }

        override fun transcribe(config: SttConfig): Flow<SttEvent> = flow {
            val next = utterances.removeFirstOrNull().orEmpty()
            calls++
            next.forEach { emit(it) }
        }
    }

    private class FakeSyncRequester : SyncRequester {
        var count = 0
            private set

        override fun requestSync() {
            count++
        }
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server = MockWebServer()
        server.start()
        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
        dao = FakeOutboxDao()
        outbox = OutboxRepository(dao, api, FakePhotoQueue())
    }

    @After
    fun tearDown() {
        server.shutdown()
        Dispatchers.resetMain()
    }

    private fun viewModel(speech: FakeSpeech) =
        BlankQuoteViewModel(speech, outbox, FakeSyncRequester())

    @Test
    fun `افزودن دستی، تعداد و قیمت پیشنهادی را نگه می‌دارد`() = runTest(dispatcher) {
        val vm = viewModel(FakeSpeech())

        vm.onDraftText("لنت پراید جلو")
        vm.onDraftQuantity("۳")
        vm.onDraftPrice("۲۵۰۰۰۰")
        vm.addDraft()
        advanceUntilIdle()

        val line = vm.uiState.value.lines.single()
        assertEquals("لنت پراید جلو", line.text)
        assertEquals(3, line.quantity)
        assertEquals(250_000, line.suggestedPrice)
        // فرم پاک می‌شود تا قلم بعدی بی‌دردسر وارد شود.
        assertEquals("", vm.uiState.value.draftText)
    }

    @Test
    fun `صدا نام و تعداد را می‌گیرد و در کاتالوگ جست‌وجو نمی‌کند`() = runTest(dispatcher) {
        val speech = FakeSpeech().apply { say(SttEvent.Final("سه تا لنت پراید")) }
        val vm = viewModel(speech)

        vm.startListening()
        advanceUntilIdle()

        val line = vm.uiState.value.lines.single()
        // عدد و واحد جدا شده‌اند؛ باقی متن عیناً نامِ قلم است.
        assertEquals(3, line.quantity)
        assertEquals("لنت پراید", line.text)
        assertNull(line.suggestedPrice)
    }

    @Test
    fun `گفتنِ دوباره‌ی یک قلم، تعداد همان ردیف را زیاد می‌کند`() = runTest(dispatcher) {
        val speech = FakeSpeech().apply {
            say(SttEvent.Final("دو تا لنت پراید"))
            say(SttEvent.Final("یک تا لنت پراید"))
        }
        val vm = viewModel(speech)

        vm.startListening()
        advanceUntilIdle()
        vm.stopListening()

        assertEquals(1, vm.uiState.value.lines.size)
        assertEquals(3, vm.uiState.value.lines.single().quantity)
    }

    /**
     * ادعای اصلی این تست: **برای هر قلم لازم نیست دکمه‌ی میکروفن دوباره زده شود.**
     * موتور بعد از هر گفتار خودش دوباره گوش می‌دهد و فقط وقتی چیزی گفته نشود
     * (یا کارگر توقف بزند) می‌بندد — چون برگه معمولاً چند قلم است.
     */
    @Test
    fun `میکروفن بین اقلام باز می‌ماند و با توقف بسته می‌شود`() = runTest(dispatcher) {
        val speech = FakeSpeech().apply {
            say(SttEvent.Final("دو تا لنت پراید"))
            say(SttEvent.Final("یک تا فیلتر روغن"))
            say(SttEvent.Final("سه تا شمع"))
        }
        val vm = viewModel(speech)

        vm.startListening()
        advanceUntilIdle()

        // سه گفتار = سه قلم؛ یک بار میکروفن، سه قلم.
        assertEquals(
            listOf("لنت پراید", "فیلتر روغن", "شمع"),
            vm.uiState.value.lines.map { it.text },
        )
        assertEquals(listOf(2, 1, 3), vm.uiState.value.lines.map { it.quantity })
        // گفتارها تمام شدند و موتور سکوت شنید ⇒ خودش خاموش شد.
        assertEquals(false, vm.uiState.value.listening)

        // توقفِ صریح هم میکروفن را می‌بندد (و درخواستِ بعدی تازه شروع می‌شود).
        vm.stopListening()
        assertEquals(false, vm.uiState.value.listening)
    }

    @Test
    fun `خطای تشخیص گفتار پیام فارسی می‌دهد و شنیدن را می‌بندد`() = runTest(dispatcher) {
        val speech = FakeSpeech().apply {
            say(SttEvent.Error(SttError.NO_NETWORK, null))
        }
        val vm = viewModel(speech)

        vm.startListening()
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.error)
        assertEquals(false, vm.uiState.value.listening)
        assertTrue(vm.uiState.value.lines.isEmpty())
    }

    @Test
    fun `ثبت، یک برگه در صف آفلاین می‌گذارد و فرم را پاک می‌کند`() = runTest(dispatcher) {
        val requester = FakeSyncRequester()
        val vm = BlankQuoteViewModel(FakeSpeech(), outbox, requester)

        vm.onDraftText("لنت پراید")
        vm.onDraftQuantity("۲")
        vm.addDraft()
        vm.onDraftText("فیلتر روغن")
        vm.addDraft()
        vm.onCustomerName("محسن")
        vm.submit()
        advanceUntilIdle()

        val rows = dao.all()
        assertEquals(1, rows.size)
        val row = rows.single()
        assertEquals(OutboxType.BLANK_QUOTATION, row.type)
        assertEquals(OutboxStatus.PENDING, row.status)
        // کلید یکتا داخلِ payload است؛ سرور همین را برای دوباره‌فرستادن می‌بیند.
        assertNotNull(row.payload)
        assertTrue(row.payload!!.contains("\"clientRequestId\":\"${row.clientRequestId}\""))
        assertTrue(row.payload!!.contains("لنت پراید"))
        assertTrue(row.payload!!.contains("فیلتر روغن"))
        assertTrue(row.payload!!.contains("محسن"))

        assertNotNull(vm.uiState.value.notice)
        assertTrue(vm.uiState.value.lines.isEmpty())
        assertEquals(1, requester.count)
    }

    @Test
    fun `بدون قلم، ثبت رد می‌شود و چیزی در صف نمی‌نشیند`() = runTest(dispatcher) {
        val vm = viewModel(FakeSpeech())

        vm.submit()
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.error)
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `حذف برگه‌ی نفرستاده فقط همان ردیف را برمی‌دارد`() = runTest(dispatcher) {
        val vm = viewModel(FakeSpeech())
        vm.onDraftText("لنت پراید")
        vm.addDraft()
        vm.submit()
        advanceUntilIdle()

        val id = dao.all().single().clientRequestId
        vm.discardPending(id)
        advanceUntilIdle()

        assertTrue(dao.all().isEmpty())
    }
}
