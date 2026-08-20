package com.warehouseos.operator.data.search

import com.warehouseos.operator.data.local.CatalogProductEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineCatalogSearchTest {

    private fun product(
        id: String,
        name: String,
        sku: String,
        partNumber: String? = null,
        barcodes: List<String> = emptyList(),
        brand: String? = null,
    ) = CatalogProductEntity(
        id = id,
        name = name,
        sku = sku,
        partNumber = partNumber,
        unit = "عدد",
        isActive = true,
        searchTokens = CatalogProductEntity.joinList(
            PersianText.tokenizeQuery(name + " " + sku + " " + (partNumber ?: "")),
        ),
        barcodes = CatalogProductEntity.joinList(barcodes),
        brand = brand,
        vehicleModel = null,
        updatedAt = 0L,
        deleted = false,
    )

    private val catalog = listOf(
        product("1", "لنت ترمز پراید", "SKU-100", partNumber = "PN-77100", brand = "سایپا"),
        product("2", "لنت ترمز پژو 405", "SKU-200", partNumber = "PN-77200", brand = "ایران خودرو"),
        product("3", "فیلتر روغن پراید", "SKU-300", partNumber = "PN-77300", brand = "سایپا"),
        product("4", "دیسک ترمز", "SKU-400", partNumber = "PN-77400"),
        product("5", "لنت", "SKU-500"),
    )

    @Test
    fun `persian normalization makes arabic and persian equivalent`() {
        assertEquals("لنت ترمز پراید", PersianText.normalize("لنت ترمز پراید"))
        assertEquals("لنت", PersianText.normalize("لنت"))
        // Arabic ي → Persian ی, Arabic ك → ک
        assertEquals("کیک", PersianText.normalize("كيك"))
        // Persian digits → ASCII
        assertEquals("123", PersianText.normalize("۱۲۳"))
        // ZWNJ → space
        assertEquals("میز کار", PersianText.normalize("میز\u200Cکار"))
    }

    @Test
    fun `full name search ranks exact product first`() {
        val hits = OfflineCatalogSearch.search(catalog, "لنت ترمز پراید")
        assertTrue(hits.isNotEmpty())
        assertEquals("1", hits.first().id)
    }

    @Test
    fun `exact sku lookup ranks the code product first`() {
        // «SKU-400» توکن‌های [sku, 400] می‌دهد؛ مرحله‌ی «کد دقیق» کالای ۴ را اول
        // می‌آورد و مرحله‌ی یکی-کم بقیه را (دقیقاً مثل سرور POS).
        val hits = OfflineCatalogSearch.search(catalog, "SKU-400")
        assertTrue(hits.isNotEmpty())
        assertEquals("4", hits.first().id)
        assertEquals("4", hits[0].id)
    }

    @Test
    fun `barcode lookup works`() {
        val withBarcode = catalog.map { p ->
            if (p.id == "3") product("3", p.name, p.sku, p.partNumber, barcodes = listOf("6260101000112"))
            else p
        }
        val hits = OfflineCatalogSearch.search(withBarcode, "6260101000112")
        assertEquals(listOf("3"), hits.map { it.id })
    }

    @Test
    fun `partial query with one missing word still finds product`() {
        // «لنت پراید» — توکن «ترمز» حذف شده؛ باید از stage یکی-کم پیدا شود.
        val hits = OfflineCatalogSearch.search(catalog, "لنت پراید")
        assertTrue(hits.isNotEmpty())
        assertEquals("1", hits.first().id)
    }

    @Test
    fun `blank and single-char queries return nothing`() {
        assertTrue(OfflineCatalogSearch.search(catalog, "").isEmpty())
        assertTrue(OfflineCatalogSearch.search(catalog, "ل").isEmpty())
    }

    @Test
    fun `unrelated query returns empty`() {
        assertTrue(OfflineCatalogSearch.search(catalog, "شمع موتور").isEmpty())
    }

    @Test
    fun `fuzzy single-character error still matches via one-less`() {
        // «لنت ترمز» با یک کلمه‌ی اضافه — باید هنوز لنت پیدا شود.
        val hits = OfflineCatalogSearch.search(catalog, "لنت ترمز آبی")
        assertTrue(hits.isNotEmpty())
        assertTrue(hits.any { it.id == "1" || it.id == "2" || it.id == "5" })
    }
}
