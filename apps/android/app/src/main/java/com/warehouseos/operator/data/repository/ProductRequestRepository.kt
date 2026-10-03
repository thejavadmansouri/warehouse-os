package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.remote.dto.ProductRequestResult
import com.warehouseos.operator.data.sync.SyncRequester
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Submits worker new-product requests to the backend review queue.
 *
 * Offline-first (same as stock ops): the request lands in the outbox locally
 * and syncs to POST /product-requests when the phone is back near the server —
 * a worker without Wi-Fi is never blocked. Syncs to the outbox as
 * NEW_PRODUCT_REQUEST; the sync worker dispatches it to the right endpoint.
 */
@Singleton
class ProductRequestRepository @Inject constructor(
    private val outbox: OutboxRepository,
    private val syncRequester: SyncRequester,
) {
    suspend fun submit(body: CreateProductRequestBody): ApiResult<ProductRequestResult> {
        outbox.enqueueProductRequest(body)
        syncRequester.requestSync()
        return ApiResult.Success(ProductRequestResult(id = "local", status = "PENDING"))
    }
}
