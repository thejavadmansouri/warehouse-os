package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * POST /uploads/pending-operation/:clientRequestId/photo — the server returns the
 * stored asset id (the same id on a deduped re-upload).
 */
@Serializable
data class PhotoUploadResponse(
    val id: String,
)
