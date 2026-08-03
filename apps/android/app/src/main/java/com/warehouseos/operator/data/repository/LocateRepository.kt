package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.LocateResultDto
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * «یافتن کالا» — سرچ اسمِ کالا و دیدنِ آدرسِ دقیقِ موجودی. برای همه‌ی نقش‌ها
 * (مدیر/فروشنده/کارگر): فقط پیداکردنِ محل، بدون تغییر موجودی.
 */
@Singleton
class LocateRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun locate(query: String): ApiResult<List<LocateResultDto>> =
        safeApiCall { api.locateProducts(query) }
}
