package com.warehouseos.operator.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Asks for a background outbox sync. Repositories depend on this interface (not
 * the concrete scheduler) so tests can fake the "sync later" call.
 */
interface SyncRequester {
    fun requestSync()
}

/**
 * Requests an outbox sync (Epic 8). Enqueued as unique work with a network
 * constraint, so it fires when connectivity is available (incl. when the device
 * gets back on Wi-Fi near the server) and never runs a tight retry loop.
 */
@Singleton
class SyncScheduler @Inject constructor(
    @ApplicationContext context: Context,
) : SyncRequester {
    private val workManager = WorkManager.getInstance(context)

    override fun requestSync() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        /*
         * REPLACE، نه KEEP.
         *
         * این یک «الان تلاش کن» است. با KEEP، اگر همین کارِ یکتا از قبل در صف بود —
         * از جمله وقتی در backoffِ نمایی نشسته (۶۰ ثانیه، ۱۲۰، ۲۴۰، …) — درخواستِ
         * تازه بی‌صدا دور انداخته می‌شد و کار تا پایانِ همان backoff معطل می‌ماند.
         *
         * یعنی هرچه بیشتر شکست خورده بود، دیرتر به تلاشِ تازه جواب می‌داد — دقیقاً
         * برعکسِ چیزی که کاربر انتظار دارد.
         *
         * لغوِ یک اجرای در جریان بی‌خطر است: هر دو drain با کلیدِ کلاینت idempotent‌اند
         * و عکس فقط بعد از موفقیت پاک می‌شود.
         */
        workManager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    /**
     * Periodic drain — the evening scenario: the worker walks back into the shop
     * Wi-Fi at the end of the day and the outbox uploads WITHOUT opening the app.
     * WorkManager fires the worker whenever the device is connected; it drains
     * everything queued that day and goes back to sleep.
     */
    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(PERIOD_MS, TimeUnit.MILLISECONDS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        workManager.enqueueUniquePeriodicWork(
            WORK_PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private companion object {
        const val WORK_NAME = "sync-outbox"
        const val WORK_PERIODIC = "sync-outbox-periodic"
        // 15 minutes — the minimum WorkManager allows; cheap because an empty
        // outbox returns without a single network call.
        const val PERIOD_MS = 15L * 60 * 1000
    }
}
