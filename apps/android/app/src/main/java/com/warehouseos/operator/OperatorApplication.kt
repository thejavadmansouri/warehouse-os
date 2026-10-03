package com.warehouseos.operator

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.warehouseos.operator.data.sync.PhotoUploadScheduler
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * Application entry point. [HiltAndroidApp] triggers Hilt code generation and
 * provides the app-level dependency container.
 *
 * Implements [Configuration.Provider] so the offline-sync WorkManager jobs (Epic 8)
 * can have their workers constructed by Hilt.
 */
@HiltAndroidApp
class OperatorApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var syncScheduler: SyncScheduler

    @Inject
    lateinit var photoUploadScheduler: PhotoUploadScheduler

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // End-of-day auto-upload: a periodic job drains the outbox whenever the
        // phone is connected, so the worker never has to open the app to sync.
        syncScheduler.schedulePeriodic()
        // Photos ride the same end-of-day window, but Wi-Fi only — a shift's worth
        // of ~200 KB images must never come out of the worker's mobile data.
        photoUploadScheduler.schedulePeriodic()
    }
}
