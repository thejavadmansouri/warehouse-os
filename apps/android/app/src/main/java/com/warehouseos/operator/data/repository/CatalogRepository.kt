package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.local.CatalogDao
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CatalogProductDto
import com.warehouseos.operator.data.remote.safeApiCall
import com.warehouseos.operator.data.search.OfflineCatalogSearch
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
     * موتور جستجو به‌صورت حافظه‌ای؛ کش بعد از هر sync باطل می‌شود.
     *
     * کش، فرمِ *ایندکس‌شده* را نگه می‌دارد نه ردیف خام: ساختِ ایندکس یک‌بار به‌ازای
     * هر بارگذاری انجام می‌شود، نه به‌ازای هر حرفی که کارگر تایپ می‌کند.
     */
    @Volatile
    private var cache: List<OfflineCatalogSearch.Indexed>? = null
    @Volatile
    private var cacheLoading = false

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
                    invalidate()
                    return CatalogSyncResult.NoNetwork
                }
                is ApiResult.Unauthorized -> {
                    invalidate()
                    return CatalogSyncResult.ServerError("نشست شما منقضی شده. دوباره وارد شوید")
                }
                is ApiResult.ServerError -> {
                    invalidate()
                    return CatalogSyncResult.ServerError(result.message)
                }
            }
        }

        invalidate()
        // فقط اینجا — یعنی همه‌ی صفحه‌ها تا آخر گرفته شدند. هر خروجِ زودهنگام بالا
        // فلگ را دست‌نخورده می‌گذارد تا کاتالوگِ نصفه «آماده» شمرده نشود.
        settings.setCatalogReady(true)
        _ready.value = true
        CatalogSyncResult.Success(rows)
    }

    /**
     * سرچ محلی با همان رتبه‌بندی POS — روی کشِ درون‌حافظه.
     *
     * کلِ کار (خواندن کش + جستجو) روی [Dispatchers.Default] اجرا می‌شود نه ترد
     * اصلی: هر تایپ چند پاس O(N) روی ~۳۳k ردیف می‌کشد و اگر روی Main اجرا شود
     * همان لگِ قابل‌لمسِ تایپ است.
     */
    suspend fun search(query: String): List<CatalogProductEntity> = withContext(Dispatchers.Default) {
        val q = query.trim()
        if (q.length < 2) return@withContext emptyList()
        OfflineCatalogSearch.search(loadAll(), q)
    }

    /**
     * کالایی که این بارکد به آن وصل است — از روی کاتالوگِ همین گوشی.
     *
     * آفلاین جواب می‌دهد، و همین نکته‌ی اصلی است: کارگر باید قبل از وصل‌کردن
     * بداند این بارکد قبلاً گرفته شده یا نه، بی‌آنکه منتظر شبکه بماند.
     */
    suspend fun findByBarcode(barcode: String): CatalogProductEntity? =
        withContext(Dispatchers.Default) {
            val code = barcode.trim()
            if (code.isEmpty()) return@withContext null
            loadAll().map { it.p }.firstOrNull { code in it.barcodeList() }
        }

    /**
     * بارکدِ تازه را همان لحظه به کاتالوگِ روی گوشی هم اضافه می‌کند.
     *
     * بدون این، کارگری که بارکدی را وصل کرده و بلافاصله همان جعبه را برای ثبت
     * ورود اسکن می‌کند، «کالا پیدا نشد» می‌گیرد — تا سینکِ بعدیِ کاتالوگ. و آن
     * دقیقاً کاری است که بعد از وصل‌کردن انجام می‌شود.
     *
     * حقیقتِ نهایی همچنان سرور است؛ این فقط جلوی یک شکافِ چنددقیقه‌ای را می‌گیرد.
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
        // کشِ درون‌حافظه‌ی جستجو کهنه شد.
        invalidate()
    }

    fun invalidate() {
        cache = null
    }

    private suspend fun loadAll(): List<OfflineCatalogSearch.Indexed> {
        cache?.let { return it }
        if (cacheLoading) {
            // خیلی بعید است؛ فقط منتظر نمان — مستقیم از DB.
            return OfflineCatalogSearch.index(dao.getAll())
        }
        cacheLoading = true
        return try {
            OfflineCatalogSearch.index(dao.getAll()).also { cache = it }
        } finally {
            cacheLoading = false
        }
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
        val syncMutex = Mutex()
    }
}
