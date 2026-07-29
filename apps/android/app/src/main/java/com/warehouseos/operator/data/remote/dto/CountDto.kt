package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

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
    val location: JsonObject? = null,
)

/** POST /mobile/count/:countId/voice body. */
@Serializable
data class CountVoiceRequest(
    val text: String,
)

/** POST /mobile/count/:countId/voice response. */
@Serializable
data class CountVoiceResponse(
    val success: Boolean = false,
    val matched: Boolean = false,
    val matchedProduct: ProductRef? = null,
    val item: JsonObject? = null,
    val explanation: CountExplanation? = null,
)

@Serializable
data class CountExplanation(
    val confidence: Double? = null,
    val goodQuantity: Int? = null,
    val badQuantity: Int? = null,
)
