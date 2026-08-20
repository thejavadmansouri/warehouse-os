package com.warehouseos.operator.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.warehouseos.operator.data.network.NetworkStatus
import com.warehouseos.operator.data.repository.CatalogRepository
import com.warehouseos.operator.data.repository.CatalogSyncResult
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Downloads/refreshes the offline product catalog (full on first run,
 * incremental afterwards). Scheduled with an unmetered (Wi-Fi) constraint so
 * the ~33k-row download never burns mobile data — it refreshes automatically
 * whenever the phone is back on the shop Wi-Fi.
 */
@HiltWorker
class CatalogSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val catalog: CatalogRepository,
    private val network: NetworkStatus,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // The Wi-Fi rule lives here, not in the constraint: WorkManager has no
        // Wi-Fi network type, and UNMETERED (its closest proxy) never fires on a
        // phone hotspot. Retry rather than succeed, so the job stays queued and
        // catches the next Wi-Fi window instead of being dropped.
        if (!network.isOnWifi()) return Result.retry()

        // NoNetwork and ServerError are both transient from the worker's point of
        // view — retry with backoff. A terminal request bug would need a code fix,
        // and the client only sends well-formed requests, so this is safe.
        return when (catalog.sync()) {
            is CatalogSyncResult.Success -> Result.success()
            else -> Result.retry()
        }
    }
}
