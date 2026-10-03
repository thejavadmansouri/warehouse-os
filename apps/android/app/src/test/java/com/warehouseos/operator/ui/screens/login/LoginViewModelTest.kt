package com.warehouseos.operator.ui.screens.login

import com.warehouseos.operator.data.FakeAppSettings
import com.warehouseos.operator.data.FakeSharedPreferences
import com.warehouseos.operator.data.FakeWorkTaskWatcher
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.repository.AuthRepository
import com.warehouseos.operator.data.session.SecureTokenStore
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
 * Epic 3 — the login screen's behaviour, not its pixels: the role gate, the
 * Persian error wording, and the two side effects that matter (the encrypted
 * session being written, and the pick-task watcher starting).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private lateinit var server: MockWebServer
    private lateinit var store: SecureTokenStore
    private lateinit var settings: FakeAppSettings
    private lateinit var watcher: FakeWorkTaskWatcher
    private lateinit var vm: LoginViewModel

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    @Before
    fun setUp() {
        // Main.immediate must resolve on the JVM, and eagerly: the VM's whole job
        // is to kick off the login coroutine from a click.
        Dispatchers.setMain(UnconfinedTestDispatcher())

        server = MockWebServer()
        server.start()
        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)

        store = SecureTokenStore(FakeSharedPreferences())
        settings = FakeAppSettings("http://10.0.0.9:3000")
        watcher = FakeWorkTaskWatcher()
        val repo = AuthRepository(api, store, watcher)
        vm = LoginViewModel(repo, settings, watcher)
    }

    @After
    fun tearDown() {
        server.shutdown()
        Dispatchers.resetMain()
    }

    /** Wait for the VM to leave the in-flight state instead of racing the network. */
    private fun settled(): LoginUiState =
        runBlocking {
            withTimeout(10_000) { vm.state.first { !it.isSubmitting } }
        }

    private fun loginBody(role: String = "STAFF"): String =
        """{"access_token":"tok-1","user":{"id":"u1","username":"ali","fullName":"علی","role":"$role"}}"""

    private fun fill(username: String = "ali", password: String = "pw") {
        vm.onUsernameChange(username)
        vm.onPasswordChange(password)
    }

    @Test
    fun `the server address shown comes from settings`() {
        assertEquals("http://10.0.0.9:3000", vm.state.value.serverUrl)
    }

    @Test
    fun `editing the server address is persisted immediately for the next request`() {
        vm.onServerUrlChange("  http://192.168.1.50:3000  ")

        // Persisted trimmed: this is what the interceptor will use on the next call.
        assertEquals("http://192.168.1.50:3000", settings.baseUrl())
        // The field itself keeps exactly what was typed, so the caret doesn't jump
        // around under the operator's fingers while they paste an address.
        assertEquals("  http://192.168.1.50:3000  ", vm.state.value.serverUrl)
    }

    @Test
    fun `submit is blocked until both fields are filled`() {
        assertFalse(vm.state.value.canSubmit)
        vm.onUsernameChange("ali")
        assertFalse(vm.state.value.canSubmit)
        vm.onPasswordChange("pw")
        assertTrue(vm.state.value.canSubmit)
    }

    @Test
    fun `a successful staff login stores the session and starts the watcher`() {
        server.enqueue(MockResponse().setBody(loginBody("STAFF")))
        fill()

        vm.login()
        val state = settled()

        assertTrue(state.loggedIn)
        assertNull(state.error)
        assertEquals("tok-1", store.currentToken())
        assertEquals("STAFF", store.cachedUser()?.role)
        // Without the watcher the phone stays silent when a pick task arrives.
        assertTrue(watcher.running)
    }

    @Test
    fun `every operator role logs in, a foreign role is refused and logged straight back out`() {
        for (role in listOf("ADMIN", "MANAGER", "STAFF")) {
            server.enqueue(MockResponse().setBody(loginBody(role)))
            fill()
            vm.login()
            assertTrue("$role must be allowed in", settled().loggedIn)
        }

        server.enqueue(MockResponse().setBody(loginBody("ACCOUNTANT")))
        // The refused role is logged straight back out, which hits the server.
        server.enqueue(MockResponse().setResponseCode(200))
        val foreign = LoginViewModel(AuthRepository(apiFor(), store, watcher), settings, watcher)
        foreign.onUsernameChange("acc")
        foreign.onPasswordChange("pw")
        foreign.login()
        val state = runBlocking { withTimeout(10_000) { foreign.state.first { !it.isSubmitting } } }

        assertEquals("دسترسی غیرمجاز", state.error)
        assertFalse(state.loggedIn)
        // A refused role must not leave a usable token on the phone.
        assertNull(store.currentToken())
        assertNull(store.cachedUser())
    }

    @Test
    fun `wrong credentials get the persian message, not a generic error`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"message":"unauth"}"""))
        fill()

        vm.login()
        val state = settled()

        assertEquals("نام کاربری یا رمز عبور اشتباه است", state.error)
        assertFalse(state.loggedIn)
        assertNull(store.currentToken())
    }

    @Test
    fun `a dead LAN says so instead of blaming the password`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        fill()

        vm.login()
        val state = settled()

        assertEquals("اتصال به سرور برقرار نشد. شبکه را بررسی کنید", state.error)
    }

    @Test
    fun `a server failure surfaces the backend message`() {
        server.enqueue(MockResponse().setResponseCode(503).setBody("""{"message":"سرور در دسترس نیست"}"""))
        fill()

        vm.login()
        val state = settled()

        assertEquals("سرور در دسترس نیست", state.error)
    }

    @Test
    fun `typing again clears the previous error`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"message":"unauth"}"""))
        fill()
        vm.login()
        assertEquals("نام کاربری یا رمز عبور اشتباه است", settled().error)

        vm.onPasswordChange("pw2")

        assertNull(vm.state.value.error)
    }

    @Test
    fun `login is never fired with an empty form`() {
        vm.login()

        assertEquals(0, server.requestCount)
        assertFalse(vm.state.value.loggedIn)
    }

    private fun apiFor(): ApiService =
        Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
}
