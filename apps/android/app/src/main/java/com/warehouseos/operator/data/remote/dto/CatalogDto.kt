package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CatalogProductDto(
    val id: String,
    val name: String,
    val sku: String,
    @SerialName("partNumber") val partNumber: String? = null,
    val unit: String = "عدد",
    @SerialName("isActive") val isActive: Boolean = true,
    @SerialName("searchTokens") val searchTokens: List<String> = emptyList(),
    val barcodes: List<String> = emptyList(),
    val brand: String? = null,
    @SerialName("vehicleModel") val vehicleModel: String? = null,
    @SerialName("updatedAt") val updatedAt: String,
    val deleted: Boolean = false,
)

@Serializable
data class CatalogPageDto(
    val products: List<CatalogProductDto> = emptyList(),
    val page: Int = 1,
    val limit: Int = 500,
    val total: Int = 0,
    @SerialName("totalPages") val totalPages: Int = 1,
    @SerialName("hasMore") val hasMore: Boolean = false,
)


/** POST /barcode/link — چسباندنِ بارکدِ روی جعبه به یک کالای موجود. */
@Serializable
data class LinkBarcodeRequest(
    val productId: String,
    val barcode: String,
    val type: String = "FACTORY",
)

@Serializable
data class LinkBarcodeResponse(
    val id: String = "",
    val barcode: String = "",
    val productId: String = "",
    /** سرور می‌گوید از قبل وصل بوده — خطا نیست. */
    val alreadyLinked: Boolean = false,
)
