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
 * Schedules photo uploads on Wi-Fi only (UNMETERED), mirroring the catalog
 * download policy: bulk bytes never ride the worker's mobile data.
 *
 * A periodic job covers the end-of-day case — the worker walks back into the
 * shop and the day's photos upload without anyone opening the app.
 */
@Singleton
class PhotoUploadScheduler @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val workManager = WorkManager.getInstance(context)

    /** One-shot nudge — used right after the outbox drains, so photos follow. */
    fun requestUpload() {
        val request = OneTimeWorkRequestBuilder<PhotoUploadWorker>()
            .setConstraints(WIFI_ONLY)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(WORK_ONCE, ExistingWorkPolicy.KEEP, request)
    }

    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<PhotoUploadWorker>(
            PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )
            .setConstraints(WIFI_ONLY)
            .build()
        workManager.enqueueUniquePeriodicWork(
            WORK_PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private companion object {
        const val WORK_ONCE = "upload-photos-once"
        const val WORK_PERIODIC = "upload-photos-periodic"

        /** Cheap when the queue is empty — the DAO returns without a network call. */
        const val PERIOD_MINUTES = 30L

        // WorkManager cannot express "Wi-Fi", and UNMETERED is the wrong proxy:
        // it never fires on a phone hotspot or a router flagged metered. Ask only
        // for connectivity here; the worker applies the Wi-Fi rule itself.
        val WIFI_ONLY = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    }
}
