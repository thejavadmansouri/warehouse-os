package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/** POST /auth/login body. */
@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

/** POST /auth/login response — matches AuthService.login(). */
@Serializable
data class LoginResponse(
    val access_token: String,
    val user: UserDto,
)

@Serializable
data class UserDto(
    val id: String,
    val username: String,
    val fullName: String? = null,
    val role: String,
)

/**
 * GET /auth/me response — JwtStrategy.validate() returns
 * { userId, username, role }. Extra fields tolerated via ignoreUnknownKeys.
 */
@Serializable
data class AuthMeResponse(
    val userId: String? = null,
    val username: String? = null,
    val role: String? = null,
    val fullName: String? = null,
)
