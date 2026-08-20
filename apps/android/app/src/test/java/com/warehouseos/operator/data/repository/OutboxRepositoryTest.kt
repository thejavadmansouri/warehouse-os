package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.FakeOutboxDao
import com.warehouseos.operator.data.FakePhotoQueue
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxStatus
import com.warehouseos.operator.data.local.OutboxType
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Two-way sync semantics of the offline outbox:
 *  - PENDING rows drain automatically (FIFO) and are marked SYNCED on 2xx.
 *  - A network failure is transient → stays PENDING, sync() == false (retry).
 *  - A server answer (4xx/5xx/401) is terminal → FAILED with the message,
 *    sync() == true (nothing left to retry), and the row is NOT re-sent on the
 *    next sync — re-sending a rejected row would hammer the API forever.
 *  - FAILED rows come back only via manual retry() / discard().
 */
class OutboxRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var dao: FakeOutboxDao
    private lateinit var repo: OutboxRepository

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
        repo = OutboxRepository(dao, api, FakePhotoQueue())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private suspend fun enqueueIn(locationBarcode: String = "SHELF-1"): OutboxEntity {
        repo.enqueue(
            type = OutboxType.IN,
            locationBarcode = locationBarcode,
            voiceText = null,
            productId = "p1",
            quantity = 3,
            unit = "عدد",
        )
        return dao.all().single()
    }

    @Test
    fun `stock op drains via sync endpoint and is marked SYNCED`() = runTest {
        val op = enqueueIn()
        server.enqueue(
            MockResponse().setBody(
                """{"synced":1,"results":[{"clientRequestId":"${op.clientRequestId}","id":"op1","status":"PENDING"}]}""",
            ),
        )

        assertTrue(repo.sync())

        val request = server.takeRequest()
        assertEquals("/sync/operations", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"clientRequestId\":\"${op.clientRequestId}\""))
        assertTrue(body.contains("\"locationBarcode\":\"SHELF-1\""))
        // ردیف‌های SYNCED از صف پاک می‌شوند — سرویس حالا صاحب رکورد است.
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `new product request posts to product requests endpoint and is marked SYNCED`() = runTest {
        repo.enqueueProductRequest(
            CreateProductRequestBody(
                name = "لنت ترمز پراید",
                brandName = "سایپا",
                quantity = 2,
                unit = "جفت",
                locationBarcode = "SHELF-2",
            ),
        )
        val op = dao.all().single()
        assertEquals(OutboxType.NEW_PRODUCT_REQUEST, op.type)

        server.enqueue(MockResponse().setBody("""{"id":"req-1","status":"PENDING"}"""))
        assertTrue(repo.sync())

        val request = server.takeRequest()
        assertEquals("/product-requests", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("لنت ترمز پراید"))
        assertTrue(body.contains("SHELF-2"))
        // هم‌اهنگ با مسیر batch: ردیفِ ارسال‌شده از صف پاک می‌شود.
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `network failure keeps rows PENDING and sync returns false`() = runTest {
        enqueueIn()
        server.enqueue(
            MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START),
        )

        assertFalse(repo.sync())
        assertEquals(OutboxStatus.PENDING, dao.all().single().status)
        // باز هم sync شود — باز هم PENDING می‌ماند (مقاوم در برابر قطعی).
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertFalse(repo.sync())
        assertEquals(OutboxStatus.PENDING, dao.all().single().status)
    }

    @Test
    fun `server rejection is terminal FAILED - sync returns true and row is not re-sent`() = runTest {
        enqueueIn()
        server.enqueue(
            MockResponse().setResponseCode(400)
                .setBody("""{"message":"موقعیت SHELF-1 پیدا نشد"}"""),
        )

        // سرور جواب داده — چیزی برای retry نیست؛ worker نباید دوباره تلاش کند.
        assertTrue(repo.sync())
        val op = dao.all().single()
        assertEquals(OutboxStatus.FAILED, op.status)
        assertEquals("موقعیت SHELF-1 پیدا نشد", op.lastError)

        // sync بعدی نباید دوباره ردیف ردشده را بفرستد — تعداد درخواست‌ها همان ۱ می‌ماند.
        assertTrue(repo.sync())
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `retry moves a FAILED row back to PENDING and it drains again`() = runTest {
        enqueueIn()
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"message":"no"}"""))
        repo.sync()
        assertEquals(OutboxStatus.FAILED, dao.all().single().status)

        repo.retry(dao.all().single().clientRequestId)
        assertEquals(OutboxStatus.PENDING, dao.all().single().status)

        server.enqueue(
            MockResponse().setBody("""{"synced":1,"results":[]}"""),
        )
        assertTrue(repo.sync())
        // ارسال موفق = ردیف از صف پاک شده.
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `discard removes a rejected row`() = runTest {
        val op = enqueueIn()
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"message":"no"}"""))
        repo.sync()
        assertEquals(1, dao.all().size)

        repo.discard(op.clientRequestId)
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `empty outbox syncs without touching the network`() = runTest {
        assertTrue(repo.sync())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `work task tick posts to work-tasks sync endpoint and is cleared on OK`() = runTest {
        repo.enqueueWorkTaskTick(taskId = "task-1", itemId = "item-1")
        val op = dao.all().single()
        assertEquals(OutboxType.WORK_TASK_TICK, op.type)

        server.enqueue(
            MockResponse().setBody(
                """{"results":[{"clientMutationId":"${op.clientRequestId}","taskId":"task-1","itemId":"item-1","status":"OK"}]}""",
            ),
        )
        assertTrue(repo.sync())

        val request = server.takeRequest()
        assertEquals("/work-tasks/sync", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"taskId\":\"task-1\""))
        assertTrue(body.contains("\"itemId\":\"item-1\""))
        // OK = سرور قلم را DONE می‌داند → ردیف از صف پاک می‌شود.
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `work task tick rejected by server is FAILED with persian message and not re-sent`() = runTest {
        repo.enqueueWorkTaskTick(taskId = "task-1", itemId = "item-1")
        val op = dao.all().single()
        server.enqueue(
            MockResponse().setBody(
                """{"results":[{"clientMutationId":"${op.clientRequestId}","taskId":"task-1","itemId":"item-1","status":"TASK_CANCELLED"}]}""",
            ),
        )

        assertTrue(repo.sync())
        val row = dao.all().single()
        assertEquals(OutboxStatus.FAILED, row.status)
        assertEquals("کار لغو شده است", row.lastError)

        // sync بعدی ردیف ردشده را دوباره نمی‌فرستد.
        assertTrue(repo.sync())
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `work task tick network failure keeps row PENDING and sync returns false`() = runTest {
        repo.enqueueWorkTaskTick(taskId = "task-1", itemId = "item-1")
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        assertFalse(repo.sync())
        val row = dao.all().single()
        assertEquals(OutboxStatus.PENDING, row.status)
        assertEquals(OutboxType.WORK_TASK_TICK, row.type)
    }

    @Test
    fun `work task tick with corrupt payload is marked FAILED locally`() = runTest {
        dao.insert(
            OutboxEntity(
                clientRequestId = "tick-corrupt",
                type = OutboxType.WORK_TASK_TICK,
                locationBarcode = "",
                voiceText = null,
                productId = null,
                quantity = 0,
                unit = null,
                status = OutboxStatus.PENDING,
                payload = "{not json",
            ),
        )

        assertTrue(repo.sync())
        val op = dao.all().single()
        assertEquals(OutboxStatus.FAILED, op.status)
        assertEquals("bad payload", op.lastError)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `product request with corrupt payload is marked FAILED locally`() = runTest {
        // payload را دستکاری می‌کنیم تا مثل خرابی دیسک باشد.
        dao.insert(
            OutboxEntity(
                clientRequestId = "corrupt",
                type = OutboxType.NEW_PRODUCT_REQUEST,
                locationBarcode = "SHELF-1",
                voiceText = null,
                productId = null,
                quantity = 1,
                unit = "عدد",
                status = OutboxStatus.PENDING,
                payload = "{not json",
            ),
        )

        assertTrue(repo.sync())
        val op = dao.all().single()
        assertEquals(OutboxStatus.FAILED, op.status)
        assertEquals("bad payload", op.lastError)
        assertEquals(0, server.requestCount)
    }
}
