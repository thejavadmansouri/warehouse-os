package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.LocateResultDto
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * «یافتن کالا» — اول سرچِ کاتالوگِ روی گوشی (همان موتور آفلاین)، بعد موجودی زنده
 * از سرور. اگر شبکه قطع باشد همان نتایجِ لوکال بدون قفسه نشان داده می‌شود؛
 * قبلاً فقط `/products/locate` صدا زده می‌شد و هر خطای شبکه = «چیزی پیدا نشد».
 */
@Singleton
class LocateRepository @Inject constructor(
    private val api: ApiService,
    private val catalog: CatalogRepository,
) {
    suspend fun locate(query: String): ApiResult<List<LocateResultDto>> {
        val q = query.trim()
        if (q.isEmpty()) return ApiResult.Success(emptyList())

        val local = runCatching { catalog.search(q) }.getOrDefault(emptyList())
        if (local.isNotEmpty()) {
            return ApiResult.Success(enrichWithStock(local))
        }

        // کاتالوگ لوکال خالی/بی‌نتیجه — مسیر قدیمی سرور (بارکد تازه، کالای سینک‌نشده).
        return safeApiCall { api.locateProducts(q) }
    }

    private suspend fun enrichWithStock(local: List<CatalogProductEntity>): List<LocateResultDto> {
        val top = local.take(STOCK_BATCH_LIMIT)
        val ids = top.joinToString(",") { it.id }
        val stock = safeApiCall { api.stockBatch(ids) }
        if (stock is ApiResult.Success && stock.data.isNotEmpty()) {
            val byId = stock.data.associateBy { it.id }
            return top.map { row ->
                byId[row.id] ?: row.toLocateStub()
            }
        }
        return top.map { it.toLocateStub() }
    }

    private fun CatalogProductEntity.toLocateStub() = LocateResultDto(
        id = id,
        name = name,
        sku = sku,
        unit = unit,
        partNumber = partNumber,
        brandName = brand,
        vehicleModelName = vehicleModel,
        totalStock = 0,
        locations = emptyList(),
    )

    private companion object {
        const val STOCK_BATCH_LIMIT = 30
    }
}
