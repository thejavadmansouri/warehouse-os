package com.warehouseos.operator.data.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import java.io.IOException

/**
 * Single result type every repository returns, so the UI branches on outcome
 * instead of catching exceptions. [Unauthorized] is split out from [ServerError]
 * because a 401 forces re-login (Epic 2/3) rather than showing a generic error.
 */
sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>

    /** No/failed connectivity — retryable, and the trigger for offline queueing (Epic 8). */
    data class NetworkError(val cause: Throwable) : ApiResult<Nothing>

    /** Backend reached but returned a non-2xx (except 401). [message] is user-facing Persian when derivable. */
    data class ServerError(val code: Int, val message: String) : ApiResult<Nothing>

    /** 401 — token missing/expired; caller must clear session and route to Login. */
    data object Unauthorized : ApiResult<Nothing>
}

/**
 * Wraps a suspend API call into an [ApiResult]. Every repository funnels through
 * this one function so error mapping stays consistent.
 */
suspend fun <T> safeApiCall(block: suspend () -> T): ApiResult<T> =
    try {
        ApiResult.Success(block())
    } catch (e: HttpException) {
        if (e.code() == 401) {
            ApiResult.Unauthorized
        } else {
            ApiResult.ServerError(e.code(), e.extractServerMessage())
        }
    } catch (e: IOException) {
        ApiResult.NetworkError(e)
    } catch (e: Exception) {
        // Serialization or other unexpected failures — surface, don't crash.
        ApiResult.NetworkError(e)
    }

// Lenient parser used only to pull a message out of an error body.
private val errorJson = Json { ignoreUnknownKeys = true; isLenient = true }

/**
 * Best-effort extraction of the API's shared error shape ({ error, message }).
 * Falls back to the HTTP message so the UI always has something to show.
 */
private fun HttpException.extractServerMessage(): String {
    val raw = try {
        response()?.errorBody()?.string()
    } catch (_: Exception) {
        null
    }
    if (!raw.isNullOrBlank()) {
        try {
            val obj = errorJson.parseToJsonElement(raw) as? JsonObject
            val msg = obj?.get("message")?.jsonPrimitive?.contentOrNull
                ?: obj?.get("error")?.jsonPrimitive?.contentOrNull
            if (!msg.isNullOrBlank()) return msg
        } catch (_: Exception) {
            // ignore — fall through to the generic message
        }
    }
    return message() ?: "خطای سرور (${code()})"
}
