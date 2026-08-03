package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /inventory/product/{id}/stock — یک مکان که این کالا در آن موجودی مثبت دارد.
 * فروش فقط از مکان‌هایی ممکن است که کالا در آن‌ها ثبت/لیبل خورده باشد.
 */
@Serializable
data class StockLocationDto(
    val locationId: String,
    val locationName: String = "",
    val locationCode: String = "",
    val locationBarcode: String = "",
    val locationPath: String = "",
    val quantity: Int,
)

/** بدنه‌ی POST /inventory/out (فروش) — کاهش موجودیِ یک مکان با ثبت قیمت واحد. */
@Serializable
data class SellRequest(
    val productId: String,
    val locationId: String,
    val quantity: Int,
    val unitPrice: Int? = null,
    val note: String? = null,
)

/** پاسخ /inventory/out — ردیف موجودیِ به‌روزشده (quantity باقی‌مانده). */
@Serializable
data class SellResponse(
    val id: String? = null,
    val quantity: Int? = null,
)

/** پاسخ GET /inventory/sale/resolve/{barcode} — کالا + موجودی در یک درخواست. */
@Serializable
data class SaleResolveDto(
    val product: SaleProductDto,
    val stock: List<StockLocationDto> = emptyList(),
)

@Serializable
data class SaleProductDto(
    val id: String,
    val name: String,
    val sku: String? = null,
    val unit: String? = null,
    val salePrice: Int? = null,
)
