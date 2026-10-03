package com.warehouseos.operator.ui.screens.mywork

import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.repository.MyWorkRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * «کارهای من» — the screen that tells a worker what happened to what they
 * recorded. If it shows the wrong number, or hides the reason a job was
 * rejected, the worker repeats the same mistake, so the mapping is pinned here.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MyWorkViewModelTest {

    private lateinit var server: MockWebServer
    private lateinit var repo: MyWorkRepository

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server = MockWebServer()
        server.start()
        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
        repo = MyWorkRepository(api)
    }

    @After
    fun tearDown() {
        server.shutdown()
        Dispatchers.resetMain()
    }

    private fun loaded(): MyWorkUiState =
        runBlocking { withTimeout(10_000) { MyWorkViewModel(repo).uiState.first { !it.loading } } }

    @Test
    fun `today's work is loaded from the my-work endpoint`() {
        server.enqueue(
            MockResponse().setBody(
                """
                {"summary":{"total":12,"pending":5,"approved":6,"rejected":1},
                 "items":[
                   {"id":"i1","status":"APPROVED","productName":"لنت ترمز ۴۰۵","quantity":5},
                   {"id":"i2","status":"REJECTED","productName":"شمع","quantity":2,"reviewNote":"قفسه اشتباه"}
                 ]}
                """.trimIndent(),
            ),
        )

        val state = loaded()

        assertEquals("/mobile/my-work", server.takeRequest().path)
        assertEquals(12, state.summary.total)
        assertEquals(6, state.summary.approved)
        assertEquals(1, state.summary.rejected)
        assertEquals(2, state.items.size)
        assertEquals("لنت ترمز ۴۰۵", state.items[0].productName)
        // The rejection reason is what the worker actually needs to see.
        assertEquals("قفسه اشتباه", state.items[1].reviewNote)
        assertNull(state.error)
    }

    @Test
    fun `an empty day is a normal answer, not an error`() {
        server.enqueue(MockResponse().setBody("""{"summary":{"total":0,"pending":0,"approved":0,"rejected":0},"items":[]}"""))

        val state = loaded()

        assertTrue(state.items.isEmpty())
        assertEquals(0, state.summary.total)
        assertNull(state.error)
    }

    @Test
    fun `extra server fields do not break the list`() {
        server.enqueue(
            MockResponse().setBody(
                """{"summary":{"total":1,"pending":1,"approved":0,"rejected":0,"futureField":9},
                    "items":[{"id":"i1","status":"PENDING","quantity":1,"reviewedBy":"مدیر","newThing":true}],
                    "trailing":{"a":1}}""",
            ),
        )

        val state = loaded()

        assertEquals(1, state.items.size)
        assertNull(state.error)
    }

    @Test
    fun `an expired session tells the worker to sign in again`() {
        server.enqueue(MockResponse().setResponseCode(401))

        val state = loaded()

        assertEquals("نشست منقضی شده — دوباره وارد شوید", state.error)
        assertFalse(state.loading)
    }

    @Test
    fun `a dead LAN is reported as a connection problem`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val state = loaded()

        assertEquals("اتصال به سرور برقرار نشد", state.error)
    }

    @Test
    fun `a server failure shows its status code`() {
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"message":"boom"}"""))

        val state = loaded()

        assertEquals("خطای سرور (500)", state.error)
    }

    @Test
    fun `retry asks the server again`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val vm = MyWorkViewModel(repo)
        runBlocking { withTimeout(10_000) { vm.uiState.first { !it.loading } } }

        server.enqueue(MockResponse().setBody("""{"summary":{"total":1,"pending":1,"approved":0,"rejected":0},"items":[]}"""))
        vm.load()

        val state = runBlocking { withTimeout(10_000) { vm.uiState.first { it.summary.total == 1 } } }
        assertNull(state.error)
        assertEquals(2, server.requestCount)
    }
}
