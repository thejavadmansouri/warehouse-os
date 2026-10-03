package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.FakeOutboxDao
import com.warehouseos.operator.data.FakePhotoQueue
import com.warehouseos.operator.data.local.OutboxStatus
import com.warehouseos.operator.data.local.OutboxType
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.remote.dto.ProductRequestResult
import com.warehouseos.operator.data.sync.SyncRequester
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * New-product requests are offline-first: submit() must NOT touch the network —
 * it lands in the outbox locally (PENDING) and returns a local receipt, so a
 * worker without Wi-Fi is never blocked. The background sync drains it later.
 */
class ProductRequestRepositoryTest {

    private class FakeSyncRequester : SyncRequester {
        var calls = 0
        override fun requestSync() {
            calls++
        }
    }

    private lateinit var server: MockWebServer
    private lateinit var dao: FakeOutboxDao
    private lateinit var outbox: OutboxRepository
    private lateinit var requester: FakeSyncRequester
    private lateinit var repo: ProductRequestRepository

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
        dao = FakeOutboxDao()
        outbox = OutboxRepository(dao, api, FakePhotoQueue())
        requester = FakeSyncRequester()
        repo = ProductRequestRepository(outbox, requester)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `submit is offline-first - enqueues locally and returns a PENDING receipt`() = runTest {
        val result = repo.submit(
            CreateProductRequestBody(
                name = "لنت ترمز پراید",
                brandName = "سایپا",
                quantity = 2,
                locationBarcode = "SHELF-1",
            ),
        )

        // بدون هیچ درخواست شبکه‌ای — آفلاین هم کار می‌کند.
        assertEquals(0, server.requestCount)
        assertTrue(result is ApiResult.Success)
        assertEquals("PENDING", (result as ApiResult.Success<ProductRequestResult>).data.status)

        // ردیف در صف است و sync درخواست شده.
        val op = dao.all().single()
        assertEquals(OutboxType.NEW_PRODUCT_REQUEST, op.type)
        assertEquals(OutboxStatus.PENDING, op.status)
        assertEquals("SHELF-1", op.locationBarcode)
        assertEquals(2, op.quantity)
        assertEquals(1, requester.calls)
    }

    @Test
    fun `submitted request drains to product-requests when the server is reachable`() = runTest {
        repo.submit(
            CreateProductRequestBody(
                name = "لنت ترمز پراید",
                brandName = "سایپا",
                quantity = 1,
                unit = "جفت",
                locationBarcode = "SHELF-2",
            ),
        )
        server.enqueue(MockResponse().setBody("""{"id":"req-1","status":"PENDING"}"""))

        assertTrue(outbox.sync())

        val request = server.takeRequest()
        assertEquals("/product-requests", request.path)
        assertTrue(request.body.readUtf8().contains("لنت ترمز پراید"))
        // ردیفِ ارسال‌شده از صف پاک شده است.
        assertTrue(dao.all().isEmpty())
    }
}
