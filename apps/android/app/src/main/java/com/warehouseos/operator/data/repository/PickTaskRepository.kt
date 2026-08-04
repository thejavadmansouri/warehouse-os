package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.PickTaskDto
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * «کار برداشت» — کارگر صف کارهایش را می‌گیرد و بعد از برداشتنِ هر قلم «آوردم» می‌زند.
 */
@Singleton
class PickTaskRepository @Inject constructor(
    private val api: ApiService,
) {
    /** صف کارهای همین کارگر (بدون تخصیص + تخصیص‌یافته به خودش). */
    suspend fun mine(): ApiResult<List<PickTaskDto>> =
        safeApiCall { api.pickTasksMine() }

    /**
     * کارگر «آوردم» زد. ادعای اتمیک: اگر کارگر دیگری زودتر برده باشد سرور 409
     * برمی‌گرداند و پیامش نام آن کارگر را دارد.
     */
    suspend fun markPicked(id: String): ApiResult<PickTaskDto> =
        safeApiCall { api.pickTaskMarkPicked(id) }
}
