package com.warehouseos.operator.data.remote

import com.warehouseos.operator.data.remote.dto.BlankQuotationLineRequest
import com.warehouseos.operator.data.remote.dto.CountVoiceRequest
import com.warehouseos.operator.data.remote.dto.CreateBlankQuotationRequest
import com.warehouseos.operator.data.remote.dto.LoginRequest
import com.warehouseos.operator.data.remote.dto.VoiceInputRequest
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Contract tests: deserialize the REAL backend JSON shapes through the app's
 * ApiService + Json config. Guards against DTO drift — the exact class of bug that
 * broke voice suggestions and count responses during development.
 */
class ApiContractTest {

    private lateinit var server: MockWebServer
    private lateinit var api: ApiService

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `login parses access_token and user`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"access_token":"tok","user":{"id":"u1","username":"admin","fullName":"مدیر","role":"ADMIN"}}""",
            ),
        )
        val res = api.login(LoginRequest("admin", "pw"))
        assertEquals("tok", res.access_token)
        assertEquals("ADMIN", res.user.role)
        assertEquals("مدیر", res.user.fullName)
    }

    @Test
    fun `voice preview needConfirm parses product and quantity`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"success":true,"needConfirm":true,"product":{"id":"p1","name":"لنت ترمز جلو پژو 405 تکستار","sku":"BRK-405"},"quantity":5,"location":{"id":"l1","name":"باکس 16"},"parsed":{"unit":"عدد","quantity":5}}""",
            ),
        )
        val res = api.previewVoice(VoiceInputRequest("LOC-1", "لنت جلو ۴۰۵ تکستار پنج عدد", "s1"))
        assertTrue(res.success)
        assertEquals(true, res.needConfirm)
        assertEquals("p1", res.product?.id)
        assertEquals(5, res.quantity)
    }

    @Test
    fun `voice preview needSelection parses nested suggestion shape`() = runTest {
        // The shape that previously crashed: { product, confidence, reasons }, not { id, name }.
        server.enqueue(
            MockResponse().setBody(
                """{"success":false,"needSelection":true,"message":"چند محصول مشابه","suggestions":[{"product":{"id":"p1","name":"لنت 405"},"confidence":88.0,"reasons":["brand"]}]}""",
            ),
        )
        val res = api.previewVoice(VoiceInputRequest("LOC-1", "لنت", "s1"))
        assertEquals(true, res.needSelection)
        assertEquals(1, res.suggestions?.size)
        assertEquals("p1", res.suggestions?.first()?.product?.id)
        assertEquals("لنت 405", res.suggestions?.first()?.product?.name)
    }

    @Test
    fun `product search parses list`() = runTest {
        server.enqueue(
            MockResponse().setBody("""[{"id":"p1","name":"لنت","sku":"BRK-405"},{"id":"p2","name":"شمع"}]"""),
        )
        val res = api.searchProducts("لنت")
        assertEquals(2, res.size)
        assertEquals("p1", res[0].id)
    }

    @Test
    fun `blank quotation create serialises its body and parses the created sheet`() = runTest {
        server.enqueue(MockResponse().setBody("""{"id":"q1","number":12,"status":"OPEN"}"""))

        val res = api.createBlankQuotation(
            CreateBlankQuotationRequest(
                clientRequestId = "bq-1",
                customerName = "محسن",
                lines = listOf(
                    BlankQuotationLineRequest("لنت پراید", 3, 200_000),
                    BlankQuotationLineRequest("فیلتر روغن", 1),
                ),
            ),
        )

        assertEquals("q1", res.id)
        assertEquals(12, res.number)

        val request = server.takeRequest()
        assertEquals("/mobile/blank-quotations", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"clientRequestId\":\"bq-1\""))
        assertTrue(body.contains("لنت پراید"))
        // قلمِ بدون قیمت، کلید suggestedPrice را اصلاً نمی‌فرستد (نه null).
        assertTrue(body.contains("\"quantity\":1"))
    }

    @Test
    fun `my blank quotations parses the slim list shape`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"data":[{"id":"q1","number":12,"status":"OPEN","createdAt":"2026-09-16T10:00:00.000Z","customerName":"محسن","unpricedCount":2}]}""",
            ),
        )

        val res = api.myBlankQuotations()

        assertEquals(1, res.data.size)
        assertEquals(12, res.data.first().number)
        assertEquals(2, res.data.first().unpricedCount)
        assertEquals("/mobile/blank-quotations/mine?limit=20", server.takeRequest().path)
    }

    @Test
    fun `count voice parses top-level confidence, reviewStatus and item quantities`() = runTest {
        // reviewStatus/confidence are top-level; goodQuantity lives in item (the fixed shape).
        server.enqueue(
            MockResponse().setBody(
                """{"success":true,"matched":true,"matchedProduct":{"id":"p1","name":"لنت"},"confidence":90.0,"reviewStatus":"NEEDS_REVIEW","needsConfirmation":true,"needsCorrection":false,"item":{"id":"i1","name":"لنت","goodQuantity":5,"badQuantity":0,"reviewStatus":"NEEDS_REVIEW"}}""",
            ),
        )
        val res = api.countVoice("c1", CountVoiceRequest("لنت پنج عدد"))
        assertTrue(res.matched)
        assertEquals("NEEDS_REVIEW", res.reviewStatus)
        assertEquals(90.0, res.confidence!!, 0.001)
        assertNotNull(res.item)
        assertEquals(5, res.item?.goodQuantity)
    }
}
