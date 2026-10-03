package com.warehouseos.operator.data.remote

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Verifies [safeApiCall] maps outcomes to the right [ApiResult] — the mapping the
 * whole app relies on for branching (esp. 401 → forced re-login).
 */
class SafeApiCallTest {

    private fun httpException(code: Int, body: String): HttpException =
        HttpException(Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun `success wraps the value`() = runTest {
        val result = safeApiCall { 42 }
        assertTrue(result is ApiResult.Success)
        assertEquals(42, (result as ApiResult.Success).data)
    }

    @Test
    fun `401 maps to Unauthorized`() = runTest {
        val result = safeApiCall<Int> { throw httpException(401, """{"message":"no"}""") }
        assertTrue(result is ApiResult.Unauthorized)
    }

    @Test
    fun `non-401 http error maps to ServerError with extracted message`() = runTest {
        val result = safeApiCall<Int> { throw httpException(500, """{"error":"x","message":"خطای سرور تست"}""") }
        assertTrue(result is ApiResult.ServerError)
        result as ApiResult.ServerError
        assertEquals(500, result.code)
        assertEquals("خطای سرور تست", result.message)
    }

    @Test
    fun `IOException maps to NetworkError`() = runTest {
        val result = safeApiCall<Int> { throw IOException("offline") }
        assertTrue(result is ApiResult.NetworkError)
    }

    @Test
    fun `unexpected exception maps to NetworkError`() = runTest {
        val result = safeApiCall<Int> { throw IllegalStateException("boom") }
        assertTrue(result is ApiResult.NetworkError)
    }
}
