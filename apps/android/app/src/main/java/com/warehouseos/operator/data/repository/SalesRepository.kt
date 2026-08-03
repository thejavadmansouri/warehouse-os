package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.ProductDto
import com.warehouseos.operator.data.remote.dto.SaleResolveDto
import com.warehouseos.operator.data.remote.dto.SellRequest
import com.warehouseos.operator.data.remote.dto.SellResponse
import com.warehouseos.operator.data.remote.dto.StockLocationDto
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * فروش (مدیر): کاهش موجودی از مکانی که کالا در آن ثبت/لیبل خورده است.
 *  - [search] پیداکردن کالا (همان سرچ قوی محصولات)
 *  - [stock] مکان‌ها و موجودیِ یک کالا (فقط موجودیِ مثبت)
 *  - [sell] ثبت فروش = کاهش موجودی + ledger با source=SALE و قیمت واحد
 * کاهش موجودی در بک‌اند اتمیک است و از فروش بیش از موجودی جلوگیری می‌کند.
 */
@Singleton
class SalesRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun search(query: String): ApiResult<List<ProductDto>> =
        safeApiCall { api.searchProducts(query) }

    suspend fun resolveBarcode(barcode: String): ApiResult<SaleResolveDto> =
        safeApiCall { api.resolveForSale(barcode.trim()) }

    suspend fun stock(productId: String): ApiResult<List<StockLocationDto>> =
        safeApiCall { api.productStock(productId) }

    suspend fun sell(
        productId: String,
        locationId: String,
        quantity: Int,
        unitPrice: Int?,
    ): ApiResult<SellResponse> =
        safeApiCall {
            api.sell(
                SellRequest(
                    productId = productId,
                    locationId = locationId,
                    quantity = quantity,
                    unitPrice = unitPrice,
                ),
            )
        }
}
