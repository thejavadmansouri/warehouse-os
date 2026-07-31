package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/** POST /product-requests — worker asks to add a product not in the catalog. */
@Serializable
data class CreateProductRequestBody(
    val name: String,
    val brandName: String? = null,
    val categoryId: String? = null,
    val vehicles: List<String> = emptyList(),
    val quantity: Int = 1,
    val unit: String = "عدد",
    val notes: String? = null,
    val voiceText: String? = null,
    val locationBarcode: String? = null,
    val sessionId: String? = null,
)

@Serializable
data class ProductRequestResult(
    val id: String,
    val status: String = "PENDING",
)
