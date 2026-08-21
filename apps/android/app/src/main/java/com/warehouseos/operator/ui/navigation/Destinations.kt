package com.warehouseos.operator.ui.navigation

import android.net.Uri

/** Prefill carried from voice/search into the new-product request form. */
data class NewProductPrefill(
    val barcode: String,
    val name: String = "",
    val brand: String = "",
    val vehicle: String = "",
    val qty: Int = 1,
    val unit: String = "",
    val voice: String = "",
)

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
    const val LOCATE = "locate"
    const val MY_WORK = "my_work"
    const val PICK_TASKS = "pick_tasks"
    const val WORK_TASKS = "work_tasks"
    const val SETTINGS = "settings"
    const val LINK_BARCODE = "link_barcode"

    // Barcode path argument — used by the voice entry screen.
    const val ARG_BARCODE = "barcode"

    // Gate in front of stock-in: forwards to SCAN when the offline catalog is on
    // the phone, otherwise downloads it first. The worker is never asked.
    const val CATALOG_SETUP = "catalog_setup"

    // Voice entry receives the scanned barcode as a path argument (Epic 5 → 6).
    const val VOICE_ENTRY = "voice_entry"
    const val VOICE_ENTRY_ROUTE = "$VOICE_ENTRY/{$ARG_BARCODE}"

    fun voiceEntry(barcode: String): String = "$VOICE_ENTRY/${Uri.encode(barcode)}"

    // New-product request. Optional prefill args come from the voice parse / search.
    const val NEW_PRODUCT = "new_product"
    const val ARG_NAME = "name"
    const val ARG_BRAND = "brand"
    const val ARG_VEHICLE = "vehicle"
    const val ARG_QTY = "qty"
    const val ARG_UNIT = "unit"
    const val ARG_VOICE = "voice"
    const val NEW_PRODUCT_ROUTE =
        "$NEW_PRODUCT?$ARG_BARCODE={$ARG_BARCODE}&$ARG_NAME={$ARG_NAME}&$ARG_BRAND={$ARG_BRAND}&$ARG_VEHICLE={$ARG_VEHICLE}&$ARG_QTY={$ARG_QTY}&$ARG_UNIT={$ARG_UNIT}&$ARG_VOICE={$ARG_VOICE}"

    fun newProduct(
        barcode: String,
        name: String = "",
        brand: String = "",
        vehicle: String = "",
        qty: Int = 1,
        unit: String = "",
        voice: String = "",
    ): String = "$NEW_PRODUCT?$ARG_BARCODE=${Uri.encode(barcode)}" +
        "&$ARG_NAME=${Uri.encode(name)}" +
        "&$ARG_BRAND=${Uri.encode(brand)}" +
        "&$ARG_VEHICLE=${Uri.encode(vehicle)}" +
        "&$ARG_QTY=$qty" +
        "&$ARG_UNIT=${Uri.encode(unit)}" +
        "&$ARG_VOICE=${Uri.encode(voice)}"
}
