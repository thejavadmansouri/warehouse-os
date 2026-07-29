package com.warehouseos.operator.data.remote

import com.warehouseos.operator.data.remote.dto.AuthMeResponse
import com.warehouseos.operator.data.remote.dto.CountStartRequest
import com.warehouseos.operator.data.remote.dto.CountStartResponse
import com.warehouseos.operator.data.remote.dto.CountVoiceRequest
import com.warehouseos.operator.data.remote.dto.CountVoiceResponse
import com.warehouseos.operator.data.remote.dto.LocationDto
import com.warehouseos.operator.data.remote.dto.LoginRequest
import com.warehouseos.operator.data.remote.dto.LoginResponse
import com.warehouseos.operator.data.remote.dto.ProductDto
import com.warehouseos.operator.data.remote.dto.ReviewConfirmRequest
import com.warehouseos.operator.data.remote.dto.ReviewItemDto
import com.warehouseos.operator.data.remote.dto.VoiceConfirmRequest
import com.warehouseos.operator.data.remote.dto.VoiceConfirmResponse
import com.warehouseos.operator.data.remote.dto.VoiceInputRequest
import com.warehouseos.operator.data.remote.dto.VoiceResponseDto
import com.warehouseos.operator.data.remote.dto.VoiceSessionDto
import com.warehouseos.operator.data.remote.dto.VoiceSessionStartRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit contract for the existing NestJS backend. Endpoints and payloads
 * match the API exactly — the Android app introduces no new backend surface.
 * Paths are relative (no leading slash); the base URL carries the trailing slash.
 *
 * All calls are suspend and return the body directly; error/status handling is
 * done by [safeApiCall] and the OkHttp interceptors, not here.
 */
interface ApiService {

    // ---- Auth ----
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): AuthMeResponse

    // ---- Locations ----
    @GET("locations/resolve/{barcode}")
    suspend fun resolveLocation(@Path("barcode") barcode: String): LocationDto

    // ---- Session ----
    @POST("inventory-session/start")
    suspend fun startSession(@Body body: VoiceSessionStartRequest): VoiceSessionDto

    // ---- Voice stock-in ----
    @POST("inventory/voice")
    suspend fun submitVoice(@Body body: VoiceInputRequest): VoiceResponseDto

    @POST("inventory/voice/confirm")
    suspend fun confirmVoice(@Body body: VoiceConfirmRequest): VoiceConfirmResponse

    // ---- Product search ----
    @GET("products/search")
    suspend fun searchProducts(@Query("q") query: String): List<ProductDto>

    // ---- Inventory count ----
    @POST("mobile/count/start")
    suspend fun startCount(@Body body: CountStartRequest): CountStartResponse

    @POST("mobile/count/{countId}/voice")
    suspend fun countVoice(
        @Path("countId") countId: String,
        @Body body: CountVoiceRequest,
    ): CountVoiceResponse

    // ---- Review ----
    @GET("mobile/review/pending")
    suspend fun pendingReview(): List<ReviewItemDto>

    @POST("mobile/review/{itemId}/confirm")
    suspend fun confirmReview(
        @Path("itemId") itemId: String,
        @Body body: ReviewConfirmRequest,
    ): ReviewItemDto
}
