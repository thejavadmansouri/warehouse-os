package com.warehouseos.operator.data.notifications

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.warehouseos.operator.MainActivity
import com.warehouseos.operator.data.remote.dto.PickTaskDto
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local notifications for pick tasks — the "phone rings" experience on a LAN
 * with no FCM/Google services.
 *
 * [PickTaskWatcherService] polls /pick-tasks/mine and hands freshly arrived
 * tasks to [notifyNewTasks], which raises a heads-up notification with the
 * system notification sound so the worker hears it even with the screen off.
 *
 * Two channels:
 *  - PICK_CHANNEL (HIGH): actual new-task alerts — sound + vibration.
 *  - ONGOING_CHANNEL (LOW, silent): the persistent foreground-service chip so
 *    the OS keeps the watcher alive without nagging the worker.
 */
@Singleton
class PickTaskNotificationManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val notificationManager: NotificationManagerCompat =
        NotificationManagerCompat.from(context)

    init {
        createChannels()
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(NotificationManager::class.java)

        manager.createNotificationChannel(
            NotificationChannel(
                PICK_CHANNEL_ID,
                "کار برداشت",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "وقتی فروشنده کالایی برای شما می‌فرستد"
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    Notification.AUDIO_ATTRIBUTES_DEFAULT,
                )
                enableVibration(true)
                // Pick work is why the phone is in the worker's pocket — let it
                // through Do-Not-Disturb. Takes effect once the worker grants
                // notification-policy access; harmless otherwise.
                setBypassDnd(true)
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                ONGOING_CHANNEL_ID,
                "دریافت کارهای برداشت",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "سرویس پس‌زمینه‌ی دریافت خودکار کارهای برداشت"
                setSound(null, null)
                enableVibration(false)
            },
        )
    }

    /**
     * Heads-up alert for freshly arrived tasks. Grouped into one notification
     * per poll so a burst of 5 tasks rings once, not five times.
     *
     * The single-task case puts the shelf in the title — the worker can see where
     * to walk without unlocking the phone (VISIBILITY_PUBLIC on the lock screen).
     * An optional seller note is appended to the body.
     */
    fun notifyNewTasks(tasks: List<PickTaskDto>) {
        if (tasks.isEmpty()) return

        val shelfOf = { task: PickTaskDto ->
            task.location?.path?.takeIf { it.isNotBlank() }
                ?: task.location?.name?.takeIf { it.isNotBlank() }
                ?: task.location?.code
                ?: ""
        }
        val note = tasks.firstNotNullOfOrNull { it.note?.takeIf(String::isNotBlank) }

        val title: String
        val body: String
        if (tasks.size == 1) {
            val task = tasks.first()
            val shelf = shelfOf(task)
            val product = task.product?.name?.takeIf { it.isNotBlank() } ?: "کالا"
            val unit = task.product?.unit?.takeIf { it.isNotBlank() } ?: "عدد"
            title = if (shelf.isNotBlank()) "کار برداشت — $shelf" else "کار برداشت جدید"
            body = buildString {
                append("بردارید: ${faNum(task.quantity)} $unit $product")
                if (note != null) append("\nپیام: $note")
            }
        } else {
            title = "کار برداشت جدید — ${faNum(tasks.size)} قلم"
            body = buildString {
                append(tasks.joinToString(" · ") { task ->
                    val shelf = shelfOf(task)
                    val product = task.product?.name?.takeIf { it.isNotBlank() } ?: "کالا"
                    if (shelf.isNotBlank()) "$product ($shelf)" else product
                })
                if (note != null) append("\nپیام: $note")
            }
        }

        val notification = NotificationCompat.Builder(context, PICK_CHANNEL_ID)
            .setSmallIcon(com.warehouseos.operator.R.drawable.ic_stat_pick)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openPickTasksIntent())
            .build()

        // Replace the previous alert so the tray stays tidy; sound plays on each one.
        // Must NOT reuse the foreground-service id, or this would silently overwrite
        // the ongoing chip instead of raising a heads-up alert.
        notificationManager.notify(ALERT_NOTIFICATION_ID, notification)
    }

    /** Silent, low-importance notification shown while the watcher service runs. */
    fun buildOngoingNotification(): Notification =
        NotificationCompat.Builder(context, ONGOING_CHANNEL_ID)
            .setSmallIcon(com.warehouseos.operator.R.drawable.ic_stat_pick)
            .setContentTitle("دریافت کارهای برداشت فعال است")
            .setContentText("با رسیدن کار جدید، گوشی صدا می‌دهد")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(openPickTasksIntent())
            .build()

    private fun openPickTasksIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_OPEN_PICK_TASKS, true)
        }
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val PICK_CHANNEL_ID = "pick_tasks"
        const val ONGOING_CHANNEL_ID = "pick_tasks_ongoing"

        /** Foreground-service chip. Owned by the OS while the watcher runs. */
        const val ONGOING_NOTIFICATION_ID = 2001

        /** New-task alerts. Separate id — see notifyNewTasks. */
        const val ALERT_NOTIFICATION_ID = 2002

        private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
        fun faNum(n: Int): String =
            n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")
    }
}
