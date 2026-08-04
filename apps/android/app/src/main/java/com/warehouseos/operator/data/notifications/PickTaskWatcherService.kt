package com.warehouseos.operator.data.notifications

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.content.ContextCompat
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.PickTaskRepository
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Foreground service that keeps the worker reachable for pick-task alerts.
 *
 * Two channels feed [PickAlertCoordinator]:
 *  1. [PickTaskSocket] — instant WebSocket push; the phone rings the moment the
 *     seller sends work (no waiting for the next poll).
 *  2. A poll of /pick-tasks/mine every few seconds as a safety net while the
 *     socket is disconnected (server restarts, LAN hiccup).
 *
 * Lifecycle: started on login / app-start with a cached session, keeps a silent
 * foreground notification so the OS doesn't kill it, stops on logout or 401.
 */
@AndroidEntryPoint
class PickTaskWatcherService : Service() {

    @Inject
    lateinit var repository: PickTaskRepository

    @Inject
    lateinit var coordinator: PickAlertCoordinator

    @Inject
    lateinit var socket: PickTaskSocket

    @Inject
    lateinit var notifier: PickTaskNotificationManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Guard against stacking a second poll loop if the service is started twice. */
    private var pollingStarted = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(
            PickTaskNotificationManager.ONGOING_NOTIFICATION_ID,
            notifier.buildOngoingNotification(),
        )

        // Instant channel first.
        socket.start()

        if (scope.isActive && !pollingStarted) {
            pollingStarted = true
            scope.launch {
                while (isActive) {
                    pollOnce()
                    delay(POLL_INTERVAL_MS)
                }
            }
        }
        return START_STICKY
    }

    private suspend fun pollOnce() {
        when (val result = repository.mine()) {
            is ApiResult.Success -> coordinator.notifyFromPoll(
                result.data.filter { it.status == "PENDING" },
            )
            ApiResult.Unauthorized -> {
                // Token gone or expired — stop watching.
                stopSelf()
            }
            is ApiResult.NetworkError, is ApiResult.ServerError -> {
                // LAN hiccup / server down — keep polling quietly (socket reconnects too).
            }
        }
    }

    /**
     * Android 15+ safety net. A `specialUse` service has no runtime cap, but if the
     * OS ever does time this service out we must stop within a few seconds or it
     * throws ForegroundServiceDidNotStopInTimeException and takes the app down.
     */
    override fun onTimeout(startId: Int) {
        stopSelf(startId)
    }

    override fun onDestroy() {
        socket.stop()
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val POLL_INTERVAL_MS = 4_000L

        const val ACTION_START = "com.warehouseos.operator.action.PICK_WATCH_START"
        const val ACTION_STOP = "com.warehouseos.operator.action.PICK_WATCH_STOP"
    }
}

/**
 * Thin wrapper so ViewModels/repositories can start/stop the watcher without
 * holding an Activity context or knowing the service class.
 */
@Singleton
class PickTaskWatcherController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** Start the foreground watcher (safe to call repeatedly). */
    fun start() {
        val intent = Intent(context, PickTaskWatcherService::class.java)
            .setAction(PickTaskWatcherService.ACTION_START)
        ContextCompat.startForegroundService(context, intent)
    }

    /** Stop the watcher (no-op when it isn't running). */
    fun stop() {
        context.stopService(Intent(context, PickTaskWatcherService::class.java))
    }
}
