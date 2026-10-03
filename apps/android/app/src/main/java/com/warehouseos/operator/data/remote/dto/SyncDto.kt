package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/** One queued operation uploaded to POST /sync/operations. */
@Serializable
data class SyncOperationRequest(
    val clientRequestId: String,
    val type: String,
    val locationBarcode: String,
    val voiceText: String? = null,
    val quantity: Int,
    val unit: String? = null,
    val productId: String? = null,
    val deviceCreatedAt: String? = null,
)

@Serializable
data class SyncOperationsRequest(
    val operations: List<SyncOperationRequest>,
)

@Serializable
data class SyncResultItem(
    val clientRequestId: String,
    val id: String? = null,
    val status: String? = null,
)

@Serializable
data class SyncOperationsResponse(
    val synced: Int = 0,
    val results: List<SyncResultItem> = emptyList(),
)
