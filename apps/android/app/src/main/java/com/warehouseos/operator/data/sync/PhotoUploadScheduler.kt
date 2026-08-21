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
 * Schedules photo uploads. The Wi-Fi rule lives in the Worker, not in the
 * constraint — see ANY_NETWORK below for why.
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
            .setConstraints(ANY_NETWORK)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(WORK_ONCE, ExistingWorkPolicy.KEEP, request)
    }

    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<PhotoUploadWorker>(
            PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )
            .setConstraints(ANY_NETWORK)
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

        /*
         * فقط «شبکه‌ای هست» — نه «وای‌فای است».
         *
         * قاعده‌ی وای‌فای عمداً اینجا بیان نمی‌شود: `UNMETERED`ِ WorkManager یک
         * حدس است و دقیقاً در همین حالت‌ها اشتباه می‌کند — هات‌اسپاتِ گوشی
         * metered گزارش می‌شود، و وای‌فای انبار که اینترنت ندارد ممکن است اصلاً
         * رد شود. با آن، کار برای همیشه اجرا نمی‌شود.
         *
         * پس شرطِ واقعی در خودِ Worker با `NetworkStatus.isOnWifi()` چک می‌شود.
         * این ثابت قبلاً `WIFI_ONLY` نام داشت و کامنتش «UNMETERED» می‌گفت، در
         * حالی که هیچ‌کدام نبود — اسمِ دروغ، ساعت‌ها دیباگِ اشتباه می‌سازد.
         */
        val ANY_NETWORK = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    }
}
