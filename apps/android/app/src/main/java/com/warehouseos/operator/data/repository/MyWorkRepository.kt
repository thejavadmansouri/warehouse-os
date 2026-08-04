package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.MyWorkResponse
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * «کارهای من» — کارگر کارهای خودش و تصمیم مدیر (تأیید/رد + دلیل) را می‌بیند.
 */
@Singleton
class MyWorkRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun myWork(): ApiResult<MyWorkResponse> =
        safeApiCall { api.myWork() }
}
