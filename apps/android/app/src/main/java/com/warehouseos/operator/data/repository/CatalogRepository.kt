package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.local.CatalogDao
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CatalogProductDto
import com.warehouseos.operator.data.remote.safeApiCall
import com.warehouseos.operator.data.search.OfflineCatalogSearch
import com.warehouseos.operator.data.search.PersianText
import com.warehouseos.operator.data.settings.CatalogReadyFlag
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Outcome of a catalog sync — the UI and the worker branch on it. */
sealed interface CatalogSyncResult {
    /** Download finished; [rows] = rows written/deleted this run. */
    data class Success(val rows: Int) : CatalogSyncResult

    /** Server unreachable — transient; caller should retry later. */
    data object NoNetwork : CatalogSyncResult

    /** Server answered with an error; [message] is user-facing Persian when derivable. */
    data class ServerError(val message: String) : CatalogSyncResult
}

/**
 * The offline product catalog (worker picker). Downloads the lean catalog from
 * GET /products/catalog when on the shop Wi-Fi (full on first run, incremental
 * by updatedAt afterwards), then serves POS-strength search from Room — no
 * internet needed while picking.
 *
 * جستجو عمداً **بدون** بارگذاریِ کلِ ۳۳k ردیف در heap است: اول SQLite با
 * توکنِ بلند فیلتر می‌کند، بعد رتبه‌بندیِ سبک روی همان کاندیدها اجرا می‌شود.
 * روی گوشی‌های کم‌رم (A12) ایندکسِ کامل قبلاً OOM می‌داد و کارگر «چیزی پیدا نشد»
 * می‌دید.
 */
@Singleton
class CatalogRepository @Inject constructor(
    private val dao: CatalogDao,
    private val api: ApiService,
    private val settings: CatalogReadyFlag,
) {
    /** شمارنده‌ی کاتالوگ محلی — برای نمایش «N محصول روی گوشی» در تنظیمات. */
    val count: Flow<Int> = dao.countFlow()

    /**
     * آیا کاتالوگ حداقل یک‌بار کامل دانلود شده؟ دروازه‌ی «ثبت ورود» روی همین است.
     *
     * حالت در حافظه نگه داشته می‌شود (نه مشتق از countFlow) تا بین نوشتنِ آخرین
     * صفحه و ست‌شدنِ فلگ، مسابقه‌ای پیش نیاید.
     */
    private val _ready = MutableStateFlow(settings.isCatalogReady())
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    /**
     * Downloads the catalog page by page (full on first run, incremental by
     * updatedAt afterwards). A [Mutex] keeps a manual "update now" from racing
     * the background WorkManager job — two concurrent downloads would waste the
     * same Wi-Fi and could interleave deletes/upserts.
     */
    suspend fun sync(): CatalogSyncResult = syncMutex.withLock {
        val since = dao.maxUpdatedAt()
        val sinceIso = since?.let { Instant.ofEpochMilli(it).toString() }

        var page = 1
        var hasMore = true
        var rows = 0
        while (hasMore) {
            val result = safeApiCall {
                api.catalog(page = page, limit = PAGE_SIZE, updatedSince = sinceIso)
            }
            when (result) {
                is ApiResult.Success -> {
                    val data = result.data
                    val fresh = data.products.map { it.toEntity() }

                    // ردیف‌های «deleted» یعنی کالا حذف شده — از کش گوشی پاک کن.
                    val deletedIds = fresh.filter { it.deleted }.map { it.id }
                    if (deletedIds.isNotEmpty()) dao.deleteByIds(deletedIds)

                    dao.upsertAll(fresh.filterNot { it.deleted })
                    rows += fresh.size

                    hasMore = data.hasMore
                    page = data.page + 1
                    // ضدّ حلقه‌ی بی‌نهایت اگر سرور count/صفحه را اشتباه بدهد.
                    if (page > MAX_PAGES) break
                }
                // Offline — transient; the caller retries (WorkManager backoff).
                // Whatever pages already landed stay (idempotent upserts); the next
                // run resumes from max(updatedAt) with no loss.
                is ApiResult.NetworkError -> {
                    return CatalogSyncResult.NoNetwork
                }
                is ApiResult.Unauthorized -> {
                    return CatalogSyncResult.ServerError("نشست شما منقضی شده. دوباره وارد شوید")
                }
                is ApiResult.ServerError -> {
                    return CatalogSyncResult.ServerError(result.message)
                }
            }
        }

        // فقط اینجا — یعنی همه‌ی صفحه‌ها تا آخر گرفته شدند. هر خروجِ زودهنگام بالا
        // فلگ را دست‌نخورده می‌گذارد تا کاتالوگِ نصفه «آماده» شمرده نشود.
        settings.setCatalogReady(true)
        _ready.value = true
        CatalogSyncResult.Success(rows)
    }

    /**
     * سرچ محلی با همان رتبه‌بندی POS — روی کاندیدهای SQLite، نه کل کاتالوگ در RAM.
     */
    suspend fun search(query: String): List<CatalogProductEntity> = withContext(Dispatchers.IO) {
        val q = query.trim()
        if (q.length < 2) return@withContext emptyList()

        val tokens = PersianText.tokenizeQuery(q)
        if (tokens.isEmpty()) return@withContext emptyList()

        // کد دقیق (SKU) — یک رفت‌وبرگشت ارزان قبل از LIKE.
        val normalizedQ = PersianText.normalize(q)
        dao.bySku(normalizedQ)?.let { exact ->
            return@withContext listOf(exact)
        }

        val ordered = tokens.sortedByDescending { it.length }
        var pool = emptyList<CatalogProductEntity>()
        outer@ for (token in ordered) {
            // کاتالوگ قدیمی ممکن است هنوز «آرم» داشته باشد در حالی که کوئری «ارم» است.
            for (variant in alefVariants(token)) {
                pool = dao.candidates(token = variant, raw = q, limit = CANDIDATE_LIMIT)
                if (pool.isNotEmpty()) break@outer
            }
        }
        if (pool.isEmpty()) return@withContext emptyList()

        OfflineCatalogSearch.search(OfflineCatalogSearch.index(pool), q)
    }

    /** گونه‌های آ/ا برای LIKE روی ردیف‌هایی که هنوز normalize نشده‌اند. */
    private fun alefVariants(token: String): List<String> {
        if (token.none { it == 'ا' || it == 'آ' }) return listOf(token)
        return listOf(token, token.replace('آ', 'ا'), token.replace('ا', 'آ')).distinct()
    }

    /**
     * کالایی که این بارکد به آن وصل است — از روی کاتالوگِ همین گوشی.
     */
    suspend fun findByBarcode(barcode: String): CatalogProductEntity? =
        withContext(Dispatchers.Default) {
            val code = PersianText.normalize(barcode.trim())
            if (code.isEmpty()) return@withContext null
            dao.byBarcode(code).firstOrNull { entity ->
                entity.barcodeList().any { PersianText.normalize(it) == code }
            }
        }

    /** قبلاً کشِ حافظه‌ای را باطل می‌کرد؛ سرچ دیگر کشِ کامل نگه نمی‌دارد. */
    fun invalidate() = Unit

    /**
     * بارکدِ تازه را همان لحظه به کاتالوگِ روی گوشی هم اضافه می‌کند.
     */
    suspend fun addBarcodeLocally(productId: String, barcode: String) {
        val row = dao.byId(productId) ?: return
        val codes = row.barcodeList()
        if (barcode in codes) return

        dao.upsertAll(
            listOf(
                row.copy(
                    barcodes = CatalogProductEntity.joinList(codes + barcode),
                ),
            ),
        )
    }

    private fun CatalogProductDto.toEntity() = CatalogProductEntity(
        id = id,
        name = name,
        sku = sku,
        partNumber = partNumber,
        unit = unit,
        isActive = isActive,
        searchTokens = CatalogProductEntity.joinList(searchTokens),
        barcodes = CatalogProductEntity.joinList(barcodes),
        brand = brand,
        vehicleModel = vehicleModel,
        updatedAt = Instant.parse(updatedAt).toEpochMilli(),
        deleted = deleted,
    )

    private companion object {
        const val PAGE_SIZE = 1000
        const val MAX_PAGES = 1000
        const val CANDIDATE_LIMIT = 2500
        val syncMutex = Mutex()
    }
}
