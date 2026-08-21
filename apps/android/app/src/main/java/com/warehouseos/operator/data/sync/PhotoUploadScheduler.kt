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
/**
 * سهمی از زمان‌بندِ عکس که مخزنِ عکس به آن نیاز دارد.
 *
 * همان دلیلِ [SyncRequester]: مخزن باید بعد از گرفتنِ عکس بگوید «الان بفرست»،
 * ولی نباید WorkManager و Context را وارد تست‌های واحدِ خودش کند.
 */
interface PhotoUploadRequester {
    fun requestUpload()
}

@Singleton
class PhotoUploadScheduler @Inject constructor(
    @ApplicationContext context: Context,
) : PhotoUploadRequester {
    private val workManager = WorkManager.getInstance(context)

    /** One-shot nudge — after the outbox drains, and after a photo is captured. */
    override fun requestUpload() {
        val request = OneTimeWorkRequestBuilder<PhotoUploadWorker>()
            .setConstraints(ANY_NETWORK)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
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
        workManager.enqueueUniqueWork(WORK_ONCE, ExistingWorkPolicy.REPLACE, request)
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
