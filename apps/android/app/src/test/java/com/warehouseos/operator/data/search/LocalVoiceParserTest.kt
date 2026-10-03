package com.warehouseos.operator.data.search

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LocalVoiceParserTest {

    @Test
    fun `word number with unit - global voice mode`() {
        val r = LocalVoiceParser.parse("سه عدد لنت جلو پژو پارس")
        assertEquals(3, r.quantity)
        assertEquals("عدد", r.unit)
        assertEquals("لنت جلو پژو پارس", r.productQuery)
    }

    @Test
    fun `persian digits with unit`() {
        val r = LocalVoiceParser.parse("۱۲ عدد فیلتر روغن")
        assertEquals(12, r.quantity)
        assertEquals("عدد", r.unit)
        assertEquals("فیلتر روغن", r.productQuery)
    }

    @Test
    fun `pair unit جفت`() {
        val r = LocalVoiceParser.parse("دو جفت شمع")
        assertEquals(2, r.quantity)
        assertEquals("جفت", r.unit)
        assertEquals("شمع", r.productQuery)
    }

    @Test
    fun `composite tens word بیست و سه`() {
        val r = LocalVoiceParser.parse("بیست و سه تا فیلتر")
        assertEquals(23, r.quantity)
        assertEquals("تا", r.unit)
        assertEquals("فیلتر", r.productQuery)
    }

    @Test
    fun `no quantity means default one and whole text is the query`() {
        val r = LocalVoiceParser.parse("لنت جلو پژو پارس")
        assertEquals(1, r.quantity)
        assertNull(r.unit)
        assertEquals("لنت جلو پژو پارس", r.productQuery)
    }

    @Test
    fun `bare sku number without unit stays in the query - not a quantity`() {
        val r = LocalVoiceParser.parse("کد ۱۰۳۴۶۹۸ اب رادیاتور")
        assertEquals(1, r.quantity)
        assertNull(r.unit)
        assertEquals("کد 1034698 اب رادیاتور", r.productQuery)
    }

    @Test
    fun `oversized digit is not a quantity`() {
        val r = LocalVoiceParser.parse("99999 عدد چیزی")
        assertEquals(1, r.quantity)
    }

    @Test
    fun `mode one phrase - quantity only, filler stays in query`() {
        val r = LocalVoiceParser.parse("سه تا از این کالا اضافه کن")
        assertEquals(3, r.quantity)
        assertEquals("تا", r.unit)
        assertEquals("از این کالا اضافه کن", r.productQuery)
    }

    @Test
    fun `six has both spellings`() {
        assertEquals(6, LocalVoiceParser.parse("شش عدد").quantity)
        assertEquals(6, LocalVoiceParser.parse("شیش عدد").quantity)
    }

    @Test
    fun `arabic digits normalize to ascii`() {
        val r = LocalVoiceParser.parse("٠٥ عدد")
        assertEquals(5, r.quantity)
    }

    @Test
    fun `blank transcript is safe`() {
        val r = LocalVoiceParser.parse("")
        assertEquals(1, r.quantity)
        assertNull(r.unit)
        assertEquals("", r.productQuery)
    }
}
