package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /products/search?q= item. Subset of the API's Product shape — the operator
 * app only needs enough to show and pick a product.
 */
@Serializable
data class ProductDto(
    val id: String,
    val name: String,
    val sku: String? = null,
    val internalBarcode: String? = null,
    val factoryBarcode: String? = null,
    val partNumber: String? = null,
    val unit: String? = null,
    val image: String? = null,
    val brand: BrandRef? = null,
    val vehicleModel: VehicleModelRef? = null,
    // آخرین ردیف قیمت (search آن را برمی‌گرداند) — برای پیش‌فرضِ قیمت فروش
    val prices: List<PriceRef>? = null,
)

@Serializable
data class BrandRef(val id: String, val name: String)

@Serializable
data class VehicleModelRef(val id: String, val name: String)

@Serializable
data class PriceRef(
    val salePrice: Int? = null,
    val purchasePrice: Int? = null,
    val wholesalePrice: Int? = null,
)
