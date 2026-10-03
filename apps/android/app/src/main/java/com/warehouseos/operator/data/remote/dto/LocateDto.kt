package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /products/locate?q= — نتیجه‌ی «یافتن کالا»: کالا + آدرسِ دقیقِ موجودی.
 * برای مدیر/فروشنده/کارگر: اسم را بزن، اگر موجود باشد بگو کجاست.
 */
@Serializable
data class LocateResultDto(
    val id: String,
    val name: String,
    val sku: String? = null,
    val unit: String? = null,
    val partNumber: String? = null,
    val brandName: String? = null,
    val vehicleModelName: String? = null,
    val totalStock: Int = 0,
    val locations: List<LocateLocationDto> = emptyList(),
)

@Serializable
data class LocateLocationDto(
    val locationId: String,
    val name: String = "",
    val code: String = "",
    val path: String = "",
    val quantity: Int = 0,
)
