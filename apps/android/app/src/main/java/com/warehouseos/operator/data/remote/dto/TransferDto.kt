package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/** GET /mobile/shelf/:barcode/stock — موجودیِ فعلی یک قفسه برای «انتقال بین قفسه». */
@Serializable
data class ShelfStockDto(
    val location: ShelfLocationDto,
    val items: List<ShelfStockItemDto> = emptyList(),
)

@Serializable
data class ShelfLocationDto(
    val id: String,
    val name: String,
    val barcode: String? = null,
)

@Serializable
data class ShelfStockItemDto(
    val productId: String,
    val name: String,
    val sku: String? = null,
    val availableQty: Int = 0,
)

/** POST /inventory-transfer — جابه‌جایی موجودی از یک قفسه به قفسه‌ی دیگر. */
@Serializable
data class TransferRequest(
    val productId: String,
    val fromLocationId: String,
    val toLocationId: String,
    val quantity: Int,
)