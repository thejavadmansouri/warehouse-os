package com.warehouseos.operator.data.session

/**
 * Logged-in operator, as persisted locally. Role is kept as the raw API string
 * ("ADMIN" | "MANAGER" | "STAFF"); [isAllowedOperator] is the role gate (Epic 3).
 */
data class AuthUser(
    val id: String,
    val username: String,
    val fullName: String,
    val role: String,
) {
    val isAllowedOperator: Boolean
        get() = role in ALLOWED_ROLES

    companion object {
        val ALLOWED_ROLES = setOf("ADMIN", "MANAGER", "STAFF")
    }
}
