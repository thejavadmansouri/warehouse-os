package com.warehouseos.operator.data.remote

import com.warehouseos.operator.data.remote.dto.AuthMeResponse
import com.warehouseos.operator.data.remote.dto.CatalogPageDto
import com.warehouseos.operator.data.remote.dto.CountStartRequest
import com.warehouseos.operator.data.remote.dto.CountStartResponse
import com.warehouseos.operator.data.remote.dto.CountVoiceRequest
import com.warehouseos.operator.data.remote.dto.CountVoiceResponse
import com.warehouseos.operator.data.remote.dto.LocateResultDto
import com.warehouseos.operator.data.remote.dto.LocationDto
import com.warehouseos.operator.data.remote.dto.LoginRequest
import com.warehouseos.operator.data.remote.dto.LoginResponse
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.remote.dto.ProductDto
import com.warehouseos.operator.data.remote.dto.ProductRequestResult
import com.warehouseos.operator.data.remote.dto.ReviewConfirmRequest
import com.warehouseos.operator.data.remote.dto.MyWorkResponse
import com.warehouseos.operator.data.remote.dto.PhotoUploadResponse
import com.warehouseos.operator.data.remote.dto.PickTaskDto
import com.warehouseos.operator.data.remote.dto.ReviewItemDto
import com.warehouseos.operator.data.remote.dto.SaleResolveDto
import com.warehouseos.operator.data.remote.dto.SellRequest
import com.warehouseos.operator.data.remote.dto.SellResponse
import com.warehouseos.operator.data.remote.dto.StockLocationDto
import com.warehouseos.operator.data.remote.dto.SyncOperationsRequest
import com.warehouseos.operator.data.remote.dto.SyncOperationsResponse
import com.warehouseos.operator.data.remote.dto.VoiceConfirmRequest
import com.warehouseos.operator.data.remote.dto.VoiceConfirmResponse
import com.warehouseos.operator.data.remote.dto.VoiceInputRequest
import com.warehouseos.operator.data.remote.dto.VoiceResponseDto
import com.warehouseos.operator.data.remote.dto.VoiceSessionDto
import com.warehouseos.operator.data.remote.dto.VoiceSessionStartRequest
import com.warehouseos.operator.data.remote.dto.WorkTaskDto
import com.warehouseos.operator.data.remote.dto.WorkTaskSyncRequest
import com.warehouseos.operator.data.remote.dto.WorkTaskSyncResponse
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
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
    // Preview: parse + match, NO commit — used for the propose→confirm flow.
    @POST("inventory/voice/preview")
    suspend fun previewVoice(@Body body: VoiceInputRequest): VoiceResponseDto

    @POST("inventory/voice")
    suspend fun submitVoice(@Body body: VoiceInputRequest): VoiceResponseDto

    @POST("inventory/voice/confirm")
    suspend fun confirmVoice(@Body body: VoiceConfirmRequest): VoiceConfirmResponse

    // ---- Product search ----
    @GET("products/search")
    suspend fun searchProducts(@Query("q") query: String): List<ProductDto>

    // ---- Offline catalog (worker) ----
    // کاتالوگ سبک برای دانلود آفلاین — searchTokens همان توکن‌های سرور است.
    @GET("products/catalog")
    suspend fun catalog(
        @Query("page") page: Int,
        @Query("limit") limit: Int = 1000,
        @Query("updatedSince") updatedSince: String? = null,
    ): CatalogPageDto

    // «یافتن کالا» — سرچ + آدرس دقیقِ موجودی (همه‌ی نقش‌ها)
    @GET("products/locate")
    suspend fun locateProducts(@Query("q") query: String): List<LocateResultDto>

    // ---- Sales (manager / salesperson) ----
    // اسکن بارکد → کالا + موجودی در یک درخواست (فروش سریع پشت پیشخوان).
    @GET("inventory/sale/resolve/{barcode}")
    suspend fun resolveForSale(@Path("barcode") barcode: String): SaleResolveDto

    // موجودیِ یک کالا به تفکیک مکان — برای انتخاب مکانِ فروش.
    @GET("inventory/product/{productId}/stock")
    suspend fun productStock(@Path("productId") productId: String): List<StockLocationDto>

    // فروش = کاهش موجودی (SALE). بک‌اند اتمیک چک می‌کند و از فروش بیش از موجودی جلوگیری می‌کند.
    @POST("inventory/out")
    suspend fun sell(@Body body: SellRequest): SellResponse

    // نشست سمت سرور را آزاد می‌کند. هر حساب هم‌زمان فقط روی یک دستگاه فعال است،
    // پس خروجِ صریح باید جای خودش را هم پس بدهد.
    @POST("auth/logout")
    suspend fun logout()

    // ---- Work tasks (worker warehouse jobs with live progress) ----
    // صف کارهای انبار همین کارگر — تخصیصی + بدون‌تخصیص، با پیشرفت done/total.
    @GET("work-tasks/mine")
    suspend fun workTasksMine(): List<WorkTaskDto>

    // جزئیات کامل یک کار — قلم‌ها + وضعیت هر قلم.
    @GET("work-tasks/{id}")
    suspend fun workTaskDetail(@Path("id") id: String): WorkTaskDto

    // تیک‌های آفلاین کارگر — batch با idempotency؛ موجودی دست نمی‌خورد.
    @POST("work-tasks/sync")
    suspend fun syncWorkTaskMutations(@Body body: WorkTaskSyncRequest): WorkTaskSyncResponse

    // ---- Pick tasks (worker picking queue) ----
    // صف کارِ برداشتِ همین کارگر — آدرس قفسه + کالا + تعداد.
    @GET("pick-tasks/mine")
    suspend fun pickTasksMine(): List<PickTaskDto>

    // «آوردم» — ادعای اتمیک؛ موجودی تغییر نمی‌کند.
    @POST("pick-tasks/{id}/picked")
    suspend fun pickTaskMarkPicked(@Path("id") id: String): PickTaskDto

    // ---- New-product request (worker → manager review) ----

    @POST("product-requests")
    suspend fun createProductRequest(@Body body: CreateProductRequestBody): ProductRequestResult

    // ---- Inventory count ----
    @POST("mobile/count/start")
    suspend fun startCount(@Body body: CountStartRequest): CountStartResponse

    @POST("mobile/count/{countId}/voice")
    suspend fun countVoice(
        @Path("countId") countId: String,
        @Body body: CountVoiceRequest,
    ): CountVoiceResponse

    // ---- Offline sync ----
    // Batch-upload the local outbox; server dedupes by clientRequestId and lands
    // each op as PENDING for manager approval.
    @POST("sync/operations")
    suspend fun syncOperations(@Body body: SyncOperationsRequest): SyncOperationsResponse

    /**
     * Photo for an already-synced operation, keyed by the same clientRequestId.
     * The server dedupes on (operation, sha256), so a retried upload attaches to
     * the same operation instead of creating a second asset. Returns 404 while
     * the operation itself hasn't been synced yet.
     */
    @Multipart
    @POST("uploads/pending-operation/{clientRequestId}/photo")
    suspend fun uploadOperationPhoto(
        @Path("clientRequestId") clientRequestId: String,
        @Part file: MultipartBody.Part,
    ): PhotoUploadResponse

    // ---- Review ----
    @GET("mobile/review/pending")
    suspend fun pendingReview(): List<ReviewItemDto>

    // کارهای من — کارگر کارهای خودش و تصمیم مدیر را می‌بیند.
    @GET("mobile/my-work")
    suspend fun myWork(): MyWorkResponse

    @POST("mobile/review/{itemId}/confirm")
    suspend fun confirmReview(
        @Path("itemId") itemId: String,
        @Body body: ReviewConfirmRequest,
    ): ReviewItemDto
}
