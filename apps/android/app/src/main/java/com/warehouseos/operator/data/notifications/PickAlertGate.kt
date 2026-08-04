package com.warehouseos.operator.data.notifications

/**
 * Cheap shared flag between the UI and the foreground watcher service.
 *
 * The worker usually finds out about new pick tasks via the notification, but when
 * they are already looking at the pick list the screen polls the queue itself — so
 * the watcher should not ring the phone at the same moment. [PickTasksScreen] flips
 * this on while visible; [PickTaskWatcherService] checks it before raising an alert.
 */
object PickAlertGate {
    @Volatile
    var pickScreenVisible: Boolean = false
}
