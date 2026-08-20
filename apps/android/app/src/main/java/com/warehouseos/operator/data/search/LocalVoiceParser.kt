package com.warehouseos.operator.data.search

/**
 * Local extraction of quantity + unit from a Persian voice transcript.
 *
 * Mirrors the server's parsing rule deliberately: a quantity counts only when it
 * is followed by an explicit unit word (عدد/تا/جفت/دست/بسته/…). A bare number
 * like «کد ۱۰۳۴۶۹۸» is a SKU, not a quantity — without a unit it stays part of
 * the product query.
 *
 * The remainder (the transcript minus the number+unit phrase) is the product
 * query, fed to the offline catalog search. Verbs and filler words («اضافه کن»,
 * «بریز») survive into the query — the search's one-less stage tolerates them.
 */
object LocalVoiceParser {

    data class Result(
        val quantity: Int,
        val unit: String?,
        val productQuery: String,
    )

    private val UNITS = setOf(
        "عدد", "تا", "جفت", "دست", "بسته", "کارتن", "حلقه", "قوطی",
        "شاخه", "پاکت", "واحد", "کیلو", "بشکه",
    )

    private val NUMBER_WORDS = mapOf(
        "یک" to 1, "دو" to 2, "سه" to 3, "چهار" to 4, "پنج" to 5,
        "شش" to 6, "شیش" to 6, "هفت" to 7, "هشت" to 8, "نه" to 9,
        "ده" to 10, "یازده" to 11, "دوازده" to 12, "سیزده" to 13,
        "چهارده" to 14, "پانزده" to 15, "شانزده" to 16, "هفده" to 17,
        "هجده" to 18, "نوزده" to 19,
    )

    private val TENS_WORDS = mapOf(
        "بیست" to 20, "سی" to 30, "چهل" to 40, "پنجاه" to 50,
        "شصت" to 60, "هفتاد" to 70, "هشتاد" to 80, "نود" to 90,
    )

    /** Parses the transcript; never throws. */
    fun parse(transcript: String?): Result {
        if (transcript.isNullOrBlank()) return Result(1, null, "")

        val tokens = PersianText.normalize(transcript)
            .split(' ')
            .filter { it.isNotBlank() }
        if (tokens.isEmpty()) return Result(1, null, "")

        for (i in tokens.indices) {
            val number = numberAt(tokens, i) ?: continue
            val unit = tokens.getOrNull(i + number.tokensConsumed)
            if (unit != null && unit in UNITS) {
                val consumed = number.tokensConsumed + 1
                val query = (tokens.take(i) + tokens.drop(i + consumed)).joinToString(" ")
                return Result(number.value, unit, query.trim())
            }
        }

        // No quantity+unit phrase — the whole transcript is the product query.
        return Result(1, null, tokens.joinToString(" "))
    }

    private data class NumberPhrase(val value: Int, val tokensConsumed: Int)

    /** Returns the number starting at [i], or null. Handles digits, words, tens+و+unit. */
    private fun numberAt(tokens: List<String>, i: Int): NumberPhrase? {
        val t = tokens[i]

        // ASCII digits (PersianText.normalize already converted ۱۲۳ → 123).
        if (t.all { it.isDigit() }) {
            return t.toIntOrNull()
                ?.takeIf { it in 1..MAX_QTY }
                ?.let { NumberPhrase(it, 1) }
        }

        // Simple word: یک/سه/پنج …
        NUMBER_WORDS[t]?.let { return NumberPhrase(it, 1) }

        // Composite: «بیست و سه» (tens + و + unit word).
        val tens = TENS_WORDS[t] ?: return null
        if (i + 2 < tokens.size && tokens[i + 1] == "و") {
            NUMBER_WORDS[tokens[i + 2]]?.let { return NumberPhrase(tens + it, 3) }
        }
        return NumberPhrase(tens, 1)
    }

    private const val MAX_QTY = 9999
}
