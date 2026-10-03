package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** POST /inventory-session/start body (warehouseId optional). */
@Serializable
data class VoiceSessionStartRequest(
    val warehouseId: String? = null,
)

/** POST /inventory-session/start response — only `id` is relied upon. */
@Serializable
data class VoiceSessionDto(
    val id: String,
)

/** POST /inventory/voice body. */
@Serializable
data class VoiceInputRequest(
    val locationBarcode: String,
    val text: String,
    val sessionId: String,
)

/**
 * POST /inventory/voice response. The backend returns either a success payload
 * or a "needs manual selection" payload; both are modelled here as one defensive
 * shape (nullable fields) rather than a polymorphic type — mirrors how the web
 * client consumes it. Callers branch on [success] / [needSelection].
 */
@Serializable
data class VoiceResponseDto(
    val success: Boolean = false,
    val needSelection: Boolean? = null,
    // Preview (/inventory/voice/preview) sets this on a confident match instead of
    // committing — the app shows a confirmation screen and then calls confirm.
    val needConfirm: Boolean? = null,
    val message: String? = null,
    val product: ProductRef? = null,
    val quantity: Int? = null,
    val location: LocationRef? = null,
    val inventory: InventoryRef? = null,
    val suggestions: List<VoiceSuggestionDto>? = null,
    val parsed: JsonObject? = null,
)

/** POST /inventory/voice/confirm body (quantity defaults to 1 server-side). */
@Serializable
data class VoiceConfirmRequest(
    val productId: String,
    val locationBarcode: String,
    val quantity: Int? = null,
    val sessionId: String,
    val note: String? = null,
)

/** POST /inventory/voice/confirm response. */
@Serializable
data class VoiceConfirmResponse(
    val success: Boolean = false,
    val productId: String? = null,
    val location: LocationRef? = null,
    val inventory: InventoryRef? = null,
)

@Serializable
data class ProductRef(
    val id: String,
    val name: String,
    val sku: String? = null,
)

@Serializable
data class LocationRef(
    val id: String,
    val name: String,
)

@Serializable
data class InventoryRef(
    val id: String,
    val quantity: Int,
)

/**
 * A ranked match suggestion from voice preview/submit. The backend shape is
 * { product, confidence, reasons } — not a bare product.
 */
@Serializable
data class VoiceSuggestionDto(
    val product: ProductRef? = null,
    val confidence: Double? = null,
    val reasons: List<String>? = null,
)
