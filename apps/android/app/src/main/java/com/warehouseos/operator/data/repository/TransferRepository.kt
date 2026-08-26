package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.LocationDto
import com.warehouseos.operator.data.remote.dto.ShelfStockDto
import com.warehouseos.operator.data.remote.dto.TransferRequest
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * «انتقال بین قفسه» — جابه‌جایی موجودی از یک قفسه به قفسه‌ی دیگر.
 *
 * سه تماس با سرور: موجودیِ فعلیِ قفسه‌ی مبدأ (بارکد → لیست کالاها) و ثبتِ
 * خودِ انتقال. مقصد فقط resolve می‌شود (همان `locations/resolve` که جاهای دیگر
 * استفاده می‌شود) تا id مکان برای body انتقال در دست باشد.
 */
@Singleton
class TransferRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun shelfStock(barcode: String): ApiResult<ShelfStockDto> =
        safeApiCall { api.shelfStock(barcode) }

    /** قفسه‌ی مقصد فقط resolve می‌شود — id مکان برای body انتقال لازم است. */
    suspend fun resolveLocation(barcode: String): ApiResult<LocationDto> =
        safeApiCall { api.resolveLocation(barcode) }

    suspend fun transfer(
        productId: String,
        fromLocationId: String,
        toLocationId: String,
        quantity: Int,
    ): ApiResult<Unit> = safeApiCall {
        api.transfer(
            TransferRequest(
                productId = productId,
                fromLocationId = fromLocationId,
                toLocationId = toLocationId,
                quantity = quantity,
            ),
        )
    }
}