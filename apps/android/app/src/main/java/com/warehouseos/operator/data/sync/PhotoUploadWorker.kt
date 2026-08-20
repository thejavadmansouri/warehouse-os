package com.warehouseos.operator.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.warehouseos.operator.data.network.NetworkStatus
import com.warehouseos.operator.data.repository.PhotoRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Uploads queued worker photos. Constrained to unmetered (Wi-Fi) networks — a
 * full shift of ~200 KB photos is real money on a worker's SIM, and the manager
 * only looks at them back at the shop anyway.
 */
@HiltWorker
class PhotoUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val photos: PhotoRepository,
    private val network: NetworkStatus,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        // Same reasoning as the catalog worker: the Wi-Fi rule can't be expressed
        // as a WorkManager constraint, so it is enforced here.
        if (!network.isOnWifi()) return Result.retry()

        // false = something still needs another attempt (offline, expired token,
        // or an operation that hasn't synced yet). Never a reason to drop a photo.
        return if (photos.sync()) Result.success() else Result.retry()
    }
}
