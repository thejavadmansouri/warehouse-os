package com.warehouseos.operator.data.notifications

import android.content.Context
import android.content.SharedPreferences
import com.warehouseos.operator.data.local.WorkTaskEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single owner of the «has this task already rung?» decision.
 *
 * Both discovery paths funnel into here:
 *  - the foreground watcher's poll ([WorkTaskWatcherService]) — every few seconds
 *  - the instant WebSocket push ([WorkTaskSocket]) — the moment the seller sends
 *
 * Dedup lives in one place so a task pushed over the socket (which rings at once)
 * is also marked as seen for the next poll, and vice versa — no double rings.
 * Ringing is skipped while the worker is looking at the task list ([WorkAlertGate]).
 */
@Singleton
class WorkAlertCoordinator @Inject constructor(
    @ApplicationContext context: Context,
    private val notifier: WorkTaskNotificationManager,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * Guarded by `this`: the poll runs on the watcher's IO coroutine while pushes
     * arrive on OkHttp's reader thread, and both mutate this set.
     */
    private val seenIds: MutableSet<String> =
        prefs.getStringSet(KEY_SEEN_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()

    /**
     * Has this install ever established a baseline?
     *
     * Persisted ids mean an earlier run already did, so work that arrived while the
     * process was dead must ring. A genuinely fresh install starts with nothing, and
     * its first poll only seeds — otherwise opening the app for the first time would
     * fire an alert for every task already on the board.
     */
    private var hasSeeded: Boolean = seenIds.isNotEmpty()

    /** Called by the poll watcher. First call seeds the baseline, later ones ring. */
    @Synchronized
    fun notifyFromPoll(pending: List<WorkTaskEntity>) {
        if (!hasSeeded) {
            hasSeeded = true
            seenIds.clear()
            seenIds.addAll(pending.map { it.id })
            persist()
            return
        }
        ringForNew(pending)
        // A task that is no longer pending is done or cancelled and — ids being
        // uuids — can never come back, so forgetting it keeps this set bounded
        // instead of growing for the life of the install.
        seenIds.retainAll(pending.mapTo(mutableSetOf()) { it.id })
        persist()
    }

    /**
     * Called by the WebSocket push.
     *
     * سوکت فقط شناسه می‌فرستد، پس خودِ کارها از همان فهرستی خوانده می‌شوند که
     * poll هم می‌خواند. اگر هنوز نرسیده باشند (کار تازه ساخته شده و refresh عقب
     * است) چیزی زنگ نمی‌زند و poll چند ثانیه بعد می‌گیردش — دیرتر، ولی گم نمی‌شود.
     */
    @Synchronized
    fun notifyFromPush(taskIds: List<String>, known: List<WorkTaskEntity>) {
        hasSeeded = true
        ringForNew(known.filter { it.id in taskIds })
    }

    private fun ringForNew(tasks: List<WorkTaskEntity>) {
        val fresh = tasks.filter { it.id !in seenIds }
        if (fresh.isEmpty()) return

        fresh.forEach { seenIds.add(it.id) }
        persist()

        // The worker is already staring at the queue — the screen updates itself,
        // ringing over it would be noise.
        if (WorkAlertGate.taskScreenVisible) return

        notifier.notifyNewTasks(fresh)
    }

    /**
     * Stores a copy: SharedPreferences keeps the instance it is handed and writes it
     * asynchronously, so handing it the live set and mutating it afterwards is
     * explicitly unsupported.
     */
    private fun persist() {
        prefs.edit().putStringSet(KEY_SEEN_IDS, HashSet(seenIds)).apply()
    }

    private companion object {
        const val PREFS_NAME = "pick_watcher"
        const val KEY_SEEN_IDS = "seen_ids"
    }
}
