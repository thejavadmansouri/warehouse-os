package com.warehouseos.operator.ui.navigation

/**
 * Type-safe route keys for the operator app navigation graph.
 * String routes keep the Epic 0 skeleton dependency-light; can migrate to
 * Navigation's typed routes later without touching call sites much.
 */
object Routes {
    const val LOGIN = "login"
    const val SHIFT_HOME = "shift_home"
    const val SCAN = "scan"
    const val VOICE_ENTRY = "voice_entry"
    const val COUNT = "count"
    const val SETTINGS = "settings"
}
