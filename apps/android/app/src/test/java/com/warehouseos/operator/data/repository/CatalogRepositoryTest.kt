package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.FakeCatalogDao
import com.warehouseos.operator.data.FakeCatalogReadyFlag
import com.warehouseos.operator.data.remote.ApiService
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Server → phone direction of the offline catalog: full download on first run,
 * incremental (updatedSince) afterwards, deletion propagation, and honest
 * failure classification (NoNetwork vs ServerError) so the worker only retries
 * when a retry can actually help.
 */
class CatalogRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var dao: FakeCatalogDao
    private lateinit var repo: CatalogRepository

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
        dao = FakeCatalogDao()
        repo = CatalogRepository(dao, api, FakeCatalogReadyFlag())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun productJson(
        id: String,
        name: String,
        sku: String,
        updatedAt: String,
        deleted: Boolean = false,
        brand: String? = null,
    ) = """{
        "id": "$id",
        "name": "$name",
        "sku": "$sku",
        "partNumber": null,
        "unit": "عدد",
        "isActive": true,
        "searchTokens": ["$name", "$sku"],
        "barcodes": [],
        "brand": ${if (brand != null) "\"$brand\"" else "null"},
        "vehicleModel": null,
        "updatedAt": "$updatedAt",
        "deleted": $deleted
    }"""

    private fun page(vararg products: String, page: Int = 1, hasMore: Boolean = false): MockResponse {
        val total = if (hasMore) products.size + 1 else products.size
        return MockResponse().setBody(
            """{"products":[${products.joinToString(",")}],"page":$page,"limit":1000,"total":$total,"totalPages":${if (hasMore) 2 else 1},"hasMore":$hasMore}""",
        )
    }

    /** تخلیهٔ همه‌ی درخواست‌های ضبط‌شده — آخرین درخواستِ sync جاری را برمی‌گرداند. */
    private fun drainRequests(): List<RecordedRequest> {
        val out = mutableListOf<RecordedRequest>()
        while (true) {
            val r = server.takeRequest(20, TimeUnit.MILLISECONDS) ?: break
            out += r
        }
        return out
    }

    @Test
    fun `full download over multiple pages upserts every product`() = runTest {
        server.enqueue(page(productJson("p1", "لنت", "SKU-1", "2026-08-05T10:00:00Z"), hasMore = true, page = 1))
        server.enqueue(page(productJson("p2", "فیلتر", "SKU-2", "2026-08-05T11:00:00Z"), page = 2))

        val result = repo.sync()

        assertTrue(result is CatalogSyncResult.Success)
        assertEquals(2, (result as CatalogSyncResult.Success).rows)
        assertEquals(2, dao.all().size)
        val requests = drainRequests()
        assertEquals(2, requests.size)
        // صفحه‌ی دوم با page=2 درخواست شده.
        assertEquals("2", requests.last().requestUrl?.queryParameter("page"))
    }

    @Test
    fun `second sync is incremental - sends updatedSince of max local updatedAt`() = runTest {
        server.enqueue(page(productJson("p1", "لنت", "SKU-1", "2026-08-05T10:00:00Z"), hasMore = true, page = 1))
        server.enqueue(page(productJson("p2", "فیلتر", "SKU-2", "2026-08-05T11:30:00Z")))

        repo.sync()
        drainRequests()

        val expectedSince = Instant.ofEpochMilli(dao.maxUpdatedAt()!!).toString()
        assertEquals("2026-08-05T11:30:00Z", expectedSince)

        repo.sync()
        val requests = drainRequests()
        assertEquals(1, requests.size)
        assertEquals(expectedSince, requests.single().requestUrl?.queryParameter("updatedSince"))
    }

    @Test
    fun `deleted products are removed from the local catalog`() = runTest {
        server.enqueue(page(productJson("p1", "لنت", "SKU-1", "2026-08-05T10:00:00Z")))
        repo.sync()
        assertEquals(1, dao.all().size)
        drainRequests()

        // کالا سمت سرور حذف شده — حالا با deleted=true می‌آید.
        server.enqueue(page(productJson("p1", "لنت", "SKU-1", "2026-08-05T10:00:00Z", deleted = true)))
        val result = repo.sync()
        assertTrue(result is CatalogSyncResult.Success)
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `network failure returns NoNetwork and keeps existing rows`() = runTest {
        server.enqueue(page(productJson("p1", "لنت", "SKU-1", "2026-08-05T10:00:00Z")))
        repo.sync()
        drainRequests()

        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val result = repo.sync()

        assertEquals(CatalogSyncResult.NoNetwork, result)
        // دانلود قبلی دست‌نخورده می‌ماند — دوباره از max(updatedAt) ادامه می‌دهد.
        assertEquals(1, dao.all().size)
    }

    @Test
    fun `server error returns ServerError with the message`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(500)
                .setBody("""{"message":"خطای داخلی سرور"}"""),
        )

        val result = repo.sync()

        assertTrue(result is CatalogSyncResult.ServerError)
        assertEquals("خطای داخلی سرور", (result as CatalogSyncResult.ServerError).message)
        assertTrue(dao.all().isEmpty())
    }

    @Test
    fun `mid-download failure keeps already-fetched pages and resumes from updatedAt`() = runTest {
        server.enqueue(page(productJson("p1", "لنت", "SKU-1", "2026-08-05T10:00:00Z"), hasMore = true, page = 1))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val result = repo.sync()
        assertEquals(CatalogSyncResult.NoNetwork, result)
        // صفحه‌ی ۱ ذخیره شده؛ صفحه‌ی ۲ قطع شد — داده‌ی قبلی نباید پاک شود.
        assertEquals(1, dao.all().size)
        drainRequests()

        // دفعه‌ی بعد از همان نقطه‌ی آبیاری ادامه می‌دهد (updatedSince = max ذخیره‌شده).
        server.enqueue(page(productJson("p2", "فیلتر", "SKU-2", "2026-08-05T11:00:00Z")))
        repo.sync()
        assertEquals(2, dao.all().size)
        val requests = drainRequests()
        assertEquals("2026-08-05T10:00:00Z", requests.single().requestUrl?.queryParameter("updatedSince"))
    }

    @Test
    fun `search works over synced rows`() = runTest {
        server.enqueue(page(productJson("p1", "لنت ترمز پراید", "SKU-1", "2026-08-05T10:00:00Z")))
        repo.sync()

        val hits = repo.search("لنت پراید")
        assertEquals(1, hits.size)
        assertEquals("p1", hits.first().id)
    }
}
