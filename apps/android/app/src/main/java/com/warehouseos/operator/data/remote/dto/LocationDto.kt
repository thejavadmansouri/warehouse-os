package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /locations/resolve/:barcode response. Only the fields the operator app
 * needs are modelled; the rest are ignored on deserialization.
 */
@Serializable
data class LocationDto(
    val id: String,
    val name: String,
    val code: String? = null,
    val barcode: String? = null,
    val path: String? = null,
    val warehouseId: String? = null,
)
