package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /mobile/review/pending item — an InventoryItem flagged NEEDS_REVIEW /
 * NEEDS_CORRECTION. Only the fields the review UI needs are modelled; joined
 * relations (product, brand, count.location) are tolerated and read defensively.
 */
@Serializable
data class ReviewItemDto(
    val id: String,
    val name: String,
    val goodQuantity: Int = 0,
    val badQuantity: Int = 0,
    val voiceText: String? = null,
    val recognizedName: String? = null,
    val recognizedBrand: String? = null,
    val reviewStatus: String? = null,
    val productId: String? = null,
    val product: ProductRef? = null,
    val brand: BrandRef? = null,
)

/** POST /mobile/review/:itemId/confirm body (productId optional). */
@Serializable
data class ReviewConfirmRequest(
    val productId: String? = null,
)
