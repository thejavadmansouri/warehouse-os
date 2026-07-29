package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.ProductDto
import com.warehouseos.operator.data.remote.dto.VoiceConfirmRequest
import com.warehouseos.operator.data.remote.dto.VoiceConfirmResponse
import com.warehouseos.operator.data.remote.dto.VoiceInputRequest
import com.warehouseos.operator.data.remote.dto.VoiceResponseDto
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Voice stock-in backend calls (propose → confirm flow).
 *
 * - [preview] runs parse + match with NO commit (the propose step).
 * - [confirm] is the single write path (commit).
 * - [search] backs manual product selection when preview can't match confidently.
 */
@Singleton
class VoiceRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun preview(
        locationBarcode: String,
        text: String,
        sessionId: String,
    ): ApiResult<VoiceResponseDto> =
        safeApiCall { api.previewVoice(VoiceInputRequest(locationBarcode, text, sessionId)) }

    suspend fun confirm(
        productId: String,
        locationBarcode: String,
        quantity: Int,
        sessionId: String,
    ): ApiResult<VoiceConfirmResponse> =
        safeApiCall {
            api.confirmVoice(
                VoiceConfirmRequest(
                    productId = productId,
                    locationBarcode = locationBarcode,
                    quantity = quantity,
                    sessionId = sessionId,
                ),
            )
        }

    suspend fun search(query: String): ApiResult<List<ProductDto>> =
        safeApiCall { api.searchProducts(query) }
}
