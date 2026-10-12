package com.warehouseos.operator.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CatalogDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(products: List<CatalogProductEntity>)

    /** حذف محصولاتی که سمت سرور حذف شده‌اند (از کاتالوگ گوشی). */
    @Query("DELETE FROM catalog_product WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("SELECT COUNT(*) FROM catalog_product")
    suspend fun count(): Int

    @Query("SELECT COUNT(*) FROM catalog_product")
    fun countFlow(): Flow<Int>

    @Query("SELECT MAX(updatedAt) FROM catalog_product")
    suspend fun maxUpdatedAt(): Long?

    /** بارگذاری کامل — فقط برای تست/ابزار؛ جستجوی اپ از [candidates] استفاده می‌کند. */
    @Query("SELECT * FROM catalog_product")
    suspend fun getAll(): List<CatalogProductEntity>

    /**
     * کاندیدهای سبک برای سرچ آفلاین — فقط ردیف‌هایی که توکنِ بلند کوئری را دارند.
     * روی A12 بارگذاریِ هم‌زمانِ ۳۳k ردیف در حافظه OOM می‌دهد و نتیجه‌ی خالی دیده می‌شود.
     */
    @Query(
        """
        SELECT * FROM catalog_product
        WHERE deleted = 0 AND (
          searchTokens LIKE '%' || :token || '%'
          OR name LIKE '%' || :token || '%'
          OR sku = :raw
          OR partNumber = :raw
          OR barcodes LIKE '%' || :token || '%'
        )
        LIMIT :limit
        """,
    )
    suspend fun candidates(token: String, raw: String, limit: Int): List<CatalogProductEntity>

    @Query(
        """
        SELECT * FROM catalog_product
        WHERE deleted = 0 AND (
          barcodes = :code
          OR barcodes LIKE :code || char(1) || '%'
          OR barcodes LIKE '%' || char(1) || :code
          OR barcodes LIKE '%' || char(1) || :code || char(1) || '%'
        )
        LIMIT 5
        """,
    )
    suspend fun byBarcode(code: String): List<CatalogProductEntity>

    @Query("SELECT * FROM catalog_product WHERE id = :id LIMIT 1")
    suspend fun byId(id: String): CatalogProductEntity?

    @Query("SELECT * FROM catalog_product WHERE sku = :sku LIMIT 1")
    suspend fun bySku(sku: String): CatalogProductEntity?
}
