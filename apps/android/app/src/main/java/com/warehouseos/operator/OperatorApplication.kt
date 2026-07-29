package com.warehouseos.operator

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
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

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
