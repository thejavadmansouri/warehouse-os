package com.warehouseos.operator.data.settings

import android.content.Context
import androidx.core.content.edit
import com.warehouseos.operator.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The catalog-readiness flag on its own, so `CatalogRepository` can be
 * unit-tested without an Android Context (same reasoning as `SyncRequester`).
 */
interface CatalogReadyFlag {
    fun isCatalogReady(): Boolean
    fun setCatalogReady(ready: Boolean)
}

/**
 * App settings (Epic 9). Currently just the backend base URL, which must be
 * runtime-configurable because the warehouse server is an on-prem LAN host whose
 * IP changes. Plain SharedPreferences (not encrypted — the URL isn't sensitive)
 * so the OkHttp interceptor can read it synchronously per request.
 */
@Singleton
class SettingsStore @Inject constructor(
    @ApplicationContext context: Context,
) : CatalogReadyFlag {
    private val prefs = context.getSharedPreferences("operator_settings", Context.MODE_PRIVATE)

    /** Configured base URL, falling back to the build flavor's default. */
    fun baseUrl(): String =
        prefs.getString(KEY_BASE_URL, null)?.takeIf { it.isNotBlank() } ?: BuildConfig.BASE_URL

    fun setBaseUrl(url: String) {
        prefs.edit { putString(KEY_BASE_URL, url.trim()) }
    }

    /**
     * True once a catalog download has run to completion at least once.
     *
     * Deliberately NOT "there are rows on the phone": a download that died
     * halfway leaves thousands of rows behind, and a worker gated on row count
     * would walk into the warehouse with a catalog that silently can't find half
     * the products. Only a fully drained sync flips this.
     */
    override fun isCatalogReady(): Boolean = prefs.getBoolean(KEY_CATALOG_READY, false)

    override fun setCatalogReady(ready: Boolean) {
        prefs.edit { putBoolean(KEY_CATALOG_READY, ready) }
    }

    private companion object {
        const val KEY_BASE_URL = "base_url"
        const val KEY_CATALOG_READY = "catalog_ready"
    }
}
