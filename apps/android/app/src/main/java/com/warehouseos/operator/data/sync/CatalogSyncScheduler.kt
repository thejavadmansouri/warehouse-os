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
            .setConstraints(ANY_NETWORK)
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
        workManager.enqueueUniqueWork(WORK_ONCE, ExistingWorkPolicy.REPLACE, request)
    }

    /** Periodic freshness (daily while on Wi-Fi). */
    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<CatalogSyncWorker>(1, TimeUnit.DAYS)
            .setConstraints(ANY_NETWORK)
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
