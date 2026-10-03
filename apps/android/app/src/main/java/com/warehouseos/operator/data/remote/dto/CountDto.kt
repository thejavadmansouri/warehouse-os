package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/** POST /mobile/count/start body. */
@Serializable
data class CountStartRequest(
    val locationBarcode: String,
)

/** POST /mobile/count/start response. */
@Serializable
data class CountStartResponse(
    val sessionId: String? = null,
    val countId: String,
    val location: CountLocation? = null,
)

@Serializable
data class CountLocation(
    val id: String? = null,
    val name: String? = null,
    val barcode: String? = null,
)

/** POST /mobile/count/:countId/voice body. */
@Serializable
data class CountVoiceRequest(
    val text: String,
)

/**
 * POST /mobile/count/:countId/voice response. Each call records one InventoryItem
 * with a reviewStatus derived from confidence (CONFIRMED / NEEDS_REVIEW /
 * NEEDS_CORRECTION) — counting records, it does not move stock.
 */
@Serializable
data class CountVoiceResponse(
    val success: Boolean = false,
    val matched: Boolean = false,
    val matchedProduct: ProductRef? = null,
    val confidence: Double? = null,
    val reviewStatus: String? = null,
    val needsConfirmation: Boolean = false,
    val needsCorrection: Boolean = false,
    val item: CountItemDto? = null,
)

@Serializable
data class CountItemDto(
    val id: String? = null,
    val name: String? = null,
    val goodQuantity: Int = 0,
    val badQuantity: Int = 0,
    val reviewStatus: String? = null,
)
