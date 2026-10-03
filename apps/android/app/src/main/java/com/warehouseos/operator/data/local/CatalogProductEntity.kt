package com.warehouseos.operator.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One row of the offline product catalog synced from GET /products/catalog.
 *
 * [searchTokens] are the SAME canonical tokens the server computes
 * (buildSearchTokens: normalized name + sku + partNumber) — the offline search
 * engine matches against them so results are identical to the POS search.
 *
 * Lists are stored as [listDelimiter]-joined strings (a control char that can
 * never appear in a token) to keep load fast — no JSON parsing per row.
 */
/*
 * The sku index is declared here as well as created in MIGRATION_1_2. Without the
 * declaration the two disagree: a phone that upgraded through the migration HAS
 * the index, Room's expected schema does not, and validation kills the app on
 * launch. Fresh installs never showed it, which is why it survived this long.
 */
@Entity(
    tableName = "catalog_product",
    indices = [Index("sku")],
)
data class CatalogProductEntity(
    @PrimaryKey val id: String,
    val name: String,
    val sku: String,
    val partNumber: String?,
    val unit: String,
    val isActive: Boolean,
    val searchTokens: String, // listDelimiter-joined
    val barcodes: String, // listDelimiter-joined
    val brand: String?,
    val vehicleModel: String?,
    val updatedAt: Long, // epoch millis, for incremental sync
    val deleted: Boolean,
) {
    fun tokenList(): List<String> = splitList(searchTokens)
    fun barcodeList(): List<String> = splitList(barcodes)

    companion object {
        const val listDelimiter = "\u0001"
        fun joinList(items: List<String>): String = items.joinToString(listDelimiter)
        private fun splitList(raw: String): List<String> =
            if (raw.isEmpty()) emptyList() else raw.split(listDelimiter)
    }
}
