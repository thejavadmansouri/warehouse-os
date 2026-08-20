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
 * Schedules catalog sync. Runs only on unmetered (Wi-Fi) networks — the
 * requirement is that the ~33k-row catalog downloads when the phone is on the
 * shop Wi-Fi, never on mobile data. A periodic job keeps it fresh while a
 * manual one-shot (Settings → «به‌روزرسانی کاتالوگ») covers the first install.
 */
@Singleton
class CatalogSyncScheduler @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val workManager = WorkManager.getInstance(context)

    /** One-shot refresh (first install / manual button). KEEP: don't stack runs. */
    fun requestSync() {
        val request = OneTimeWorkRequestBuilder<CatalogSyncWorker>()
            .setConstraints(WIFI_ONLY)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(WORK_ONCE, ExistingWorkPolicy.KEEP, request)
    }

    /** Periodic freshness (daily while on Wi-Fi). */
    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<CatalogSyncWorker>(1, TimeUnit.DAYS)
            .setConstraints(WIFI_ONLY)
            .build()
        workManager.enqueueUniquePeriodicWork(
            WORK_PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private companion object {
        const val WORK_ONCE = "sync-catalog-once"
        const val WORK_PERIODIC = "sync-catalog-periodic"

        // WorkManager cannot express "Wi-Fi", and UNMETERED is the wrong proxy:
        // it never fires on a phone hotspot or a router flagged metered. Ask only
        // for connectivity here; the worker applies the Wi-Fi rule itself.
        val WIFI_ONLY = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    }
}
