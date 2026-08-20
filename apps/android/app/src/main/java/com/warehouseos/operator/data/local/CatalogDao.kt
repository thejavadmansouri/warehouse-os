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

    /** بارگذاری کامل برای موتور جستجوی محلی (33k ردیف ≈ چند مگابایت، یک‌بار در حافظه). */
    @Query("SELECT * FROM catalog_product")
    suspend fun getAll(): List<CatalogProductEntity>

    @Query("SELECT * FROM catalog_product WHERE sku = :sku LIMIT 1")
    suspend fun bySku(sku: String): CatalogProductEntity?
}
