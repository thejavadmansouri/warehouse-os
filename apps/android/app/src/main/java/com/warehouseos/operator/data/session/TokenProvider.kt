package com.warehouseos.operator.data.session

/**
 * Read-only token source for the networking layer. Kept as an interface so the
 * OkHttp interceptor doesn't depend on how the token is stored.
 *
 * Epic 1 binds [InMemoryTokenProvider]; Epic 2 replaces the binding with an
 * encrypted-DataStore-backed implementation without touching the interceptor.
 */
interface TokenProvider {
    /** Current bearer token, or null when logged out. */
    fun currentToken(): String?
}
