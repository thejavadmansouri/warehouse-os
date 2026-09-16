package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.FakeSharedPreferences
import com.warehouseos.operator.data.FakeWorkTaskWatcher
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.session.SecureTokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
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
 * Epic 2 (auth & secure session) contract, exercised against the real Retrofit
 * stack + MockWebServer so the DTOs, error mapping and the token store are all
 * covered together — the combination that actually fails in the warehouse.
 */
class AuthRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var store: SecureTokenStore
    private lateinit var watcher: FakeWorkTaskWatcher
    private lateinit var repo: AuthRepository

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
        store = SecureTokenStore(FakeSharedPreferences())
        watcher = FakeWorkTaskWatcher()
        repo = AuthRepository(api, store, watcher)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun loginBody(token: String = "tok-1", role: String = "STAFF"): String =
        """{"access_token":"$token","user":{"id":"u1","username":"ali","fullName":"علی","role":"$role"}}"""

    @Test
    fun `successful login persists the token and the identity`() = runTest {
        server.enqueue(MockResponse().setBody(loginBody()))

        val result = repo.login("ali", "pw")

        assertTrue(result is ApiResult.Success)
        assertEquals("STAFF", (result as ApiResult.Success).data.role)
        assertEquals("tok-1", store.currentToken())
        assertEquals("ali", store.cachedUser()?.username)

        val request = server.takeRequest()
        assertEquals("/auth/login", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"username\":\"ali\""))
        assertTrue(body.contains("\"password\":\"pw\""))
    }

    @Test
    fun `username is trimmed before it leaves the phone`() = runTest {
        server.enqueue(MockResponse().setBody(loginBody()))

        repo.login("  ali  ", "pw")

        assertTrue(server.takeRequest().body.readUtf8().contains("\"username\":\"ali\""))
    }

    @Test
    fun `401 is reported as bad credentials and stores nothing`() = runTest {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"message":"unauth"}"""))

        val result = repo.login("ali", "wrong")

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(store.currentToken())
        assertNull(store.cachedUser())
    }

    @Test
    fun `server error carries the backend message through`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(500).setBody("""{"message":"خطای داخلی سرور"}"""),
        )

        val result = repo.login("ali", "pw")

        assertEquals(ApiResult.ServerError(500, "خطای داخلی سرور"), result)
        assertNull(store.currentToken())
    }

    @Test
    fun `a dead LAN is a network error not a rejected login`() = runTest {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val result = repo.login("ali", "pw")

        assertTrue(result is ApiResult.NetworkError)
        assertNull(store.currentToken())
    }

    @Test
    fun `start routing with no token goes to login without calling the API`() = runTest {
        assertEquals(StartupDestination.LOGIN, repo.resolveStartDestination())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a confirmed token goes straight to shift home`() = runTest {
        store.saveSession("tok-1", com.warehouseos.operator.data.session.AuthUser("u1", "ali", "علی", "STAFF"))
        server.enqueue(MockResponse().setBody("""{"userId":"u1","username":"ali","role":"STAFF"}"""))

        assertEquals(StartupDestination.SHIFT_HOME, repo.resolveStartDestination())
        assertEquals("/auth/me", server.takeRequest().path)
        // The session survives the check untouched.
        assertEquals("tok-1", store.currentToken())
    }

    @Test
    fun `a rejected token is cleared and the worker goes back to login`() = runTest {
        store.saveSession("tok-expired", com.warehouseos.operator.data.session.AuthUser("u1", "ali", "علی", "STAFF"))
        server.enqueue(MockResponse().setResponseCode(401))

        assertEquals(StartupDestination.LOGIN, repo.resolveStartDestination())
        assertNull(store.currentToken())
        assertNull(store.cachedUser())
    }

    @Test
    fun `an unreachable server must not throw the worker out of a valid session`() = runTest {
        store.saveSession("tok-1", com.warehouseos.operator.data.session.AuthUser("u1", "ali", "علی", "STAFF"))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        assertEquals(StartupDestination.SHIFT_HOME, repo.resolveStartDestination())
        assertEquals("tok-1", store.currentToken())
    }

    // runBlocking, not runTest: logout's correctness is about REAL elapsed time.
    // Under runTest's virtual clock the repository's 2s ceiling would fire
    // instantly against the scheduler and the request would never leave the phone,
    // which is precisely the behaviour these two tests exist to pin down.
    @Test
    fun `logout clears the session and stops the watcher even when the server is gone`() = runBlocking {
        store.saveSession("tok-1", com.warehouseos.operator.data.session.AuthUser("u1", "ali", "علی", "STAFF"))
        // Unanswered on purpose: this is the dead-LAN handover.
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val startedAt = System.nanoTime()
        repo.logout()
        val elapsedMs = (System.nanoTime() - startedAt) / 1_000_000

        assertNull(store.currentToken())
        assertNull(store.cachedUser())
        assertFalse(watcher.running)
        assertEquals(1, watcher.stopCount)
        // The operator must be able to hand the phone over now, not after the
        // 30s OkHttp read timeout.
        assertTrue("logout blocked for ${elapsedMs}ms", elapsedMs < 5_000)
    }

    @Test
    fun `logout still tells the server, so the single-device seat is released`() = runBlocking {
        store.saveSession("tok-1", com.warehouseos.operator.data.session.AuthUser("u1", "ali", "علی", "STAFF"))
        server.enqueue(MockResponse().setResponseCode(200))

        repo.logout()

        assertEquals("/auth/logout", server.takeRequest().path)
        assertNull(store.currentToken())
    }
}
