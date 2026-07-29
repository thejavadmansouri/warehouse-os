package com.warehouseos.operator.data.settings

import android.content.Context
import androidx.core.content.edit
import com.warehouseos.operator.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * App settings (Epic 9). Currently just the backend base URL, which must be
 * runtime-configurable because the warehouse server is an on-prem LAN host whose
 * IP changes. Plain SharedPreferences (not encrypted — the URL isn't sensitive)
 * so the OkHttp interceptor can read it synchronously per request.
 */
@Singleton
class SettingsStore @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs = context.getSharedPreferences("operator_settings", Context.MODE_PRIVATE)

    /** Configured base URL, falling back to the build flavor's default. */
    fun baseUrl(): String =
        prefs.getString(KEY_BASE_URL, null)?.takeIf { it.isNotBlank() } ?: BuildConfig.BASE_URL

    fun setBaseUrl(url: String) {
        prefs.edit { putString(KEY_BASE_URL, url.trim()) }
    }

    private companion object {
        const val KEY_BASE_URL = "base_url"
    }
}
