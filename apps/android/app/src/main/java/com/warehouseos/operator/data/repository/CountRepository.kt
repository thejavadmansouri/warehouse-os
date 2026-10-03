package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CountStartRequest
import com.warehouseos.operator.data.remote.dto.CountStartResponse
import com.warehouseos.operator.data.remote.dto.CountVoiceRequest
import com.warehouseos.operator.data.remote.dto.CountVoiceResponse
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Inventory count backend calls (Epic 7). Counting creates its own session/count
 * server-side and records each spoken item as an InventoryItem with a review
 * status — no propose/commit split is needed (it records, it doesn't move stock).
 */
@Singleton
class CountRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun start(locationBarcode: String): ApiResult<CountStartResponse> =
        safeApiCall { api.startCount(CountStartRequest(locationBarcode)) }

    suspend fun addVoiceItem(countId: String, text: String): ApiResult<CountVoiceResponse> =
        safeApiCall { api.countVoice(countId, CountVoiceRequest(text)) }
}
