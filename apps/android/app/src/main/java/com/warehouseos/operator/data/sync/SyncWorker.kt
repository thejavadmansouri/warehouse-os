package com.warehouseos.operator.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.warehouseos.operator.data.repository.OutboxRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Drains the offline outbox to the server (Epic 8). WorkManager runs it under a
 * network-connected constraint; if the LAN server still isn't reachable the batch
 * stays PENDING and we ask WorkManager to retry with backoff.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val outbox: OutboxRepository,
    private val photoUploads: PhotoUploadScheduler,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val reachedServer = outbox.sync()
        // Photos can only be accepted once their operation exists server-side, so
        // they follow the drain rather than racing it. The photo job carries its
        // own Wi-Fi constraint, so this stays a no-op out on mobile data.
        if (reachedServer) photoUploads.requestUpload()
        return if (reachedServer) Result.success() else Result.retry()
    }
}
