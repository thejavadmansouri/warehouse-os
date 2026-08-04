package com.warehouseos.operator.data.notifications

import com.warehouseos.operator.data.remote.dto.PickTaskDto
import com.warehouseos.operator.data.session.SecureTokenStore
import com.warehouseos.operator.data.settings.SettingsStore
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * Instant push channel for pick tasks — the replacement for «poll and wait up to
 * 4 seconds».
 *
 * Connects to ws://<server>/pick-tasks/ws?token=<JWT> and, the moment the seller
 * creates a task, the server sends it here. [PickAlertCoordinator] rings the
 * phone immediately (with the same dedup as the poll fallback, so no double rings).
 *
 * The on-prem server has no FCM, so this is a plain WebSocket over the LAN —
 * OkHttp speaks it natively, no extra dependency. Reconnects with exponential
 * backoff; the watcher's poll stays as the safety net while disconnected.
 */
@Singleton
class PickTaskSocket @Inject constructor(
    private val tokenStore: SecureTokenStore,
    private val settings: SettingsStore,
    private val coordinator: PickAlertCoordinator,
    private val json: Json,
    okHttpClient: OkHttpClient,
) {
    // Ping so the server (and any NAT) notices a dead link promptly.
    private val client: OkHttpClient = okHttpClient.newBuilder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var running = false

    @Volatile
    private var reconnectDelayMs = INITIAL_RECONNECT_MS

    private var webSocket: WebSocket? = null

    /** Safe to call repeatedly (login, app start). */
    fun start() {
        if (running) return
        running = true
        reconnectDelayMs = INITIAL_RECONNECT_MS
        connect()
    }

    fun stop() {
        running = false
        webSocket?.close(NORMAL_CLOSE, "stopped")
        webSocket = null
    }

    private fun connect() {
        if (!running) return

        // Not signed in yet, or the server address is unusable — retry rather than
        // giving up: `running` stays true, so start() would be a no-op and the
        // socket would never come back.
        val token = tokenStore.currentToken()
        val base = settings.baseUrl().trim().toHttpUrlOrNull()
        if (token == null || base == null) {
            scheduleReconnect()
            return
        }

        // Keep the http/https scheme: OkHttp performs the WebSocket upgrade itself,
        // and HttpUrl.Builder.scheme() rejects "ws"/"wss" outright
        // (IllegalArgumentException: unexpected scheme: ws).
        val url = base.newBuilder()
            .addPathSegments("pick-tasks/ws")
            .addQueryParameter("token", token)
            .build()

        // Never let a malformed address take the app down — connect() runs on the
        // main thread via the watcher service's onStartCommand.
        runCatching { client.newWebSocket(Request.Builder().url(url).build(), listener) }
            .onSuccess { webSocket = it }
            .onFailure { scheduleReconnect() }
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectDelayMs = INITIAL_RECONNECT_MS
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            runCatching {
                val push = json.decodeFromString<PickPushDto>(text)
                if (push.type == PUSH_TYPE_PICK_TASKS_CREATED) {
                    coordinator.notifyFromPush(push.tasks)
                }
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            scheduleReconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        if (!running) return
        webSocket = null
        scope.launch {
            delay(reconnectDelayMs)
            reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(MAX_RECONNECT_MS)
            connect()
        }
    }

    companion object {
        const val PUSH_TYPE_PICK_TASKS_CREATED = "pick-tasks-created"
        private const val NORMAL_CLOSE = 1000
        private const val INITIAL_RECONNECT_MS = 1_000L
        private const val MAX_RECONNECT_MS = 30_000L
    }
}

/** پیام push سرور: { type: "pick-tasks-created", tasks: [...] }. */
@Serializable
data class PickPushDto(
    val type: String = "",
    val tasks: List<PickTaskDto> = emptyList(),
)
