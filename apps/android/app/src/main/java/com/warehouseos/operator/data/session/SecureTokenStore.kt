package com.warehouseos.operator.data.session

import android.content.SharedPreferences
import androidx.core.content.edit
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * Persistent, encrypted session store (Epic 2) — replaces the Epic 1
 * InMemoryTokenProvider. Backed by EncryptedSharedPreferences (provided in
 * [com.warehouseos.operator.di.StorageModule]), so the JWT is encrypted at rest
 * via the Android Keystore.
 *
 * Implements [TokenProvider] so the OkHttp interceptor keeps depending only on
 * the interface. [currentToken] must be synchronous (interceptors are), so the
 * token is mirrored in a volatile field and prefs are the source of truth on
 * process start.
 */
@Singleton
class SecureTokenStore @Inject constructor(
    @Named("securePrefs") private val prefs: SharedPreferences,
) : TokenProvider {

    @Volatile
    private var cachedToken: String? = prefs.getString(KEY_TOKEN, null)

    override fun currentToken(): String? = cachedToken

    fun saveSession(token: String, user: AuthUser) {
        cachedToken = token
        prefs.edit {
            putString(KEY_TOKEN, token)
            putString(KEY_USER_ID, user.id)
            putString(KEY_USERNAME, user.username)
            putString(KEY_FULL_NAME, user.fullName)
            putString(KEY_ROLE, user.role)
        }
    }

    /**
     * Swap just the JWT (sliding-session refresh). Keeps the cached user fields
     * — only the token rotated, the identity behind it did not.
     */
    override fun updateToken(token: String) {
        if (token.isBlank() || token == cachedToken) return
        cachedToken = token
        prefs.edit { putString(KEY_TOKEN, token) }
    }

    fun cachedUser(): AuthUser? {
        val id = prefs.getString(KEY_USER_ID, null) ?: return null
        val role = prefs.getString(KEY_ROLE, null) ?: return null
        return AuthUser(
            id = id,
            username = prefs.getString(KEY_USERNAME, "").orEmpty(),
            fullName = prefs.getString(KEY_FULL_NAME, "").orEmpty(),
            role = role,
        )
    }

    fun clear() {
        cachedToken = null
        prefs.edit { clear() }
    }

    private companion object {
        const val KEY_TOKEN = "jwt"
        const val KEY_USER_ID = "user_id"
        const val KEY_USERNAME = "username"
        const val KEY_FULL_NAME = "full_name"
        const val KEY_ROLE = "role"
    }
}
