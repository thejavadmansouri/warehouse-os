package com.warehouseos.operator.ui.navigation

import android.net.Uri

/**
 * Type-safe route keys for the operator app navigation graph.
 * String routes keep the navigation dependency-light; can migrate to
 * Navigation's typed routes later without touching call sites much.
 */
object Routes {
    const val STARTUP = "startup"
    const val LOGIN = "login"
    const val SHIFT_HOME = "shift_home"
    const val SCAN = "scan"
    const val COUNT = "count"
    const val SETTINGS = "settings"

    // Voice entry receives the scanned barcode as a path argument (Epic 5 → 6).
    const val ARG_BARCODE = "barcode"
    const val VOICE_ENTRY = "voice_entry"
    const val VOICE_ENTRY_ROUTE = "$VOICE_ENTRY/{$ARG_BARCODE}"

    fun voiceEntry(barcode: String): String = "$VOICE_ENTRY/${Uri.encode(barcode)}"
}
