package com.warehouseos.operator.data.repository

import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.ApiService
import com.warehouseos.operator.data.remote.dto.CreateProductRequestBody
import com.warehouseos.operator.data.remote.dto.ProductRequestResult
import com.warehouseos.operator.data.remote.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Submits worker new-product requests to the backend review queue. */
@Singleton
class ProductRequestRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun submit(body: CreateProductRequestBody): ApiResult<ProductRequestResult> =
        safeApiCall { api.createProductRequest(body) }
}
