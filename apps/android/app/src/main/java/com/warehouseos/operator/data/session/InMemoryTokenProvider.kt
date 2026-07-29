package com.warehouseos.operator.data.session

import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Temporary in-memory token holder (Epic 1) so the networking layer is fully
 * wired and testable now. The token is lost on process death.
 *
 * Epic 2 replaces this with encrypted persistent storage; because callers depend
 * only on [TokenProvider], that swap is a DI binding change.
 */
@Singleton
class InMemoryTokenProvider @Inject constructor() : TokenProvider {
    private val token = AtomicReference<String?>(null)

    override fun currentToken(): String? = token.get()

    fun setToken(value: String?) = token.set(value)

    fun clear() = token.set(null)
}
