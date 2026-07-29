package com.warehouseos.operator.data.session

/**
 * Read-only token source for the networking layer. Kept as an interface so the
 * OkHttp interceptor doesn't depend on how the token is stored.
 *
 * Bound to [SecureTokenStore] (encrypted persistent storage) — the interceptor
 * depends only on this interface, so the storage implementation can change freely.
 */
interface TokenProvider {
    /** Current bearer token, or null when logged out. */
    fun currentToken(): String?
}
