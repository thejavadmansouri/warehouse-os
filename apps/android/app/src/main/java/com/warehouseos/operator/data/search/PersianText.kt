package com.warehouseos.operator.data.search

import java.text.Normalizer

/**
 * Kotlin port of the server's `persian-normalize.ts` + `tokenizeQuery` —
 * the exact same canonicalization the POS search uses, so an offline query on
 * the phone matches what the web panel would return. Keep both in sync.
 */
object PersianText {

    private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
    private const val AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"

    private val ARABIC_TO_PERSIAN = mapOf(
        'ي' to 'ی', // ي
        'ى' to 'ی', // ى
        'ك' to 'ک', // ك
        'ة' to 'ه', // ة
    )

    /** Tashkil (U+064B–U+0652) + tatweel (U+0640). */
    private val TASHKIL = Regex("[\u064B-\u0652\u0640]")

    /** ZWNJ → space; other zero-width / bidi marks removed. */
    private val ZWNJ = Regex("\u200C")
    private val ZERO_WIDTH_OR_BIDI = Regex("[\u200B\u200D\u200E\u200F\uFEFF]")

    private val WHITESPACE = Regex("\\s+")

    /** Idempotent canonical normalizer — mirrors normalizePersian(). */
    fun normalize(input: String?): String {
        if (input.isNullOrEmpty()) return ""

        var t = Normalizer.normalize(input, Normalizer.Form.NFC)

        // Arabic → Persian letters
        val sb = StringBuilder(t.length)
        for (c in t) sb.append(ARABIC_TO_PERSIAN[c] ?: c)
        t = sb.toString()

        // Persian / Arabic-Indic digits → ASCII
        val digits = StringBuilder(t.length)
        for (c in t) {
            when {
                c in '۰'..'۹' -> digits.append(FA_DIGITS.indexOf(c))
                c in '٠'..'٩' -> digits.append(AR_DIGITS.indexOf(c))
                else -> digits.append(c)
            }
        }
        t = digits.toString()

        t = TASHKIL.replace(t, "")
        t = ZWNJ.replace(t, " ")
        t = ZERO_WIDTH_OR_BIDI.replace(t, "")

        // Latin fragments arrive both ways (تکستار / Textar)
        t = t.lowercase()

        return WHITESPACE.replace(t, " ").trim()
    }

    /**
     * Mirrors tokenizeQuery(): normalize, split on separators, drop
     * single-char noise tokens.
     */
    fun tokenizeQuery(input: String): List<String> {
        val normalized = normalize(input)
        if (normalized.isEmpty()) return emptyList()

        return normalized
            .split(Regex("[\\s/(),._\\-]+"))
            .map { it.trim() }
            .filter { it.length > 1 }
    }
}
