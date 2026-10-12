package com.warehouseos.operator.data.search

import com.warehouseos.operator.data.local.CatalogProductEntity

/**
 * In-memory ranked search — POS pipeline port, kept **light** for low-RAM phones
 * (A12-class). No inverted postings map: that doubled heap and killed the process
 * on first «بررسی و ادامه». Speed comes from pre-normalized [Indexed] + filtering
 * substring stage by the longest query token.
 */
object OfflineCatalogSearch {

    private const val MAX_RESULTS = 100
    private const val SUBSTRING_THRESHOLD = 20

    /** Builds the reusable index. Do this once per catalog load, never per query. */
    fun index(products: List<CatalogProductEntity>): List<Indexed> =
        products.map { Indexed(it) }

    fun search(products: List<CatalogProductEntity>, query: String): List<CatalogProductEntity> =
        search(index(products), query)

    /** Throws nothing; returns ranked results (empty for a blank/1-char query). */
    @JvmName("searchIndexed")
    fun search(indexed: List<Indexed>, query: String): List<CatalogProductEntity> {
        val q = PersianText.normalize(query)
        if (q.isEmpty()) return emptyList()
        val tokens = PersianText.tokenizeQuery(q)
        if (tokens.isEmpty()) return emptyList()

        val out = ArrayList<CatalogProductEntity>(MAX_RESULTS)
        val seen = HashSet<String>()

        fun push(list: List<Indexed>, limit: Int) {
            for (ix in list) {
                if (seen.add(ix.p.id)) out.add(ix.p)
                if (out.size >= limit) return
            }
        }

        // 1) exact code
        push(
            indexed.filter { ix ->
                ix.skuNorm == q || ix.partNorm == q || ix.barcodes.contains(q)
            },
            MAX_RESULTS,
        )

        // 2) full token-set containment
        push(byTokens(indexed, tokens), MAX_RESULTS)

        // 3) substring — فقط ردیف‌هایی که توکنِ بلند کوئری را دارند
        if (out.size < SUBSTRING_THRESHOLD) {
            push(bySubstring(indexed, tokens), MAX_RESULTS)

            if (out.size < SUBSTRING_THRESHOLD && tokens.size >= 2) {
                for (skip in tokens.indices) {
                    if (out.size >= MAX_RESULTS) break
                    val subset = tokens.filterIndexed { i, _ -> i != skip }
                    push(bySubstring(indexed, subset), MAX_RESULTS)
                }
            }
        }

        return out.take(MAX_RESULTS)
    }

    /**
     * Pre-split + normalized once per catalog load.
     * آ→ا اینجا اعمال می‌شود تا کاتالوگ قدیمی بدون دانلود دوباره درست match شود.
     */
    class Indexed(val p: CatalogProductEntity) {
        private val tokenList: List<String> =
            p.tokenList()
                .map { PersianText.normalize(it) }
                .filter { it.length > 1 }

        val tokens: Set<String> = tokenList.toHashSet()
        val joined: String = tokenList.joinToString(" ")
        val barcodes: Set<String> =
            p.barcodeList().mapNotNull {
                PersianText.normalize(it).takeIf { n -> n.isNotEmpty() }
            }.toHashSet()
        val skuNorm: String = PersianText.normalize(p.sku)
        val partNorm: String = PersianText.normalize(p.partNumber)
        val tokenCount: Int = tokenList.size
    }

    private fun byTokens(indexed: List<Indexed>, tokens: List<String>): List<Indexed> {
        val joined = tokens.joinToString(" ")
        return indexed
            .filter { ix -> tokens.all { ix.tokens.contains(it) } }
            .sortedWith(
                compareBy<Indexed>(
                    { PersianText.normalize(it.p.name) != joined },
                    { it.tokenCount },
                    { it.p.name.length },
                ),
            )
    }

    private fun bySubstring(indexed: List<Indexed>, tokens: List<String>): List<Indexed> {
        val key = tokens.maxByOrNull { it.length } ?: return emptyList()
        // فیلتر ارزان: فقط کسانی که توکنِ بلند را دارند اسکن کامل می‌شوند
        val pool = indexed.asSequence().filter { it.joined.contains(key) }
        return pool
            .mapNotNull { ix ->
                val txt = ix.joined
                if (!tokens.all { txt.contains(it) }) return@mapNotNull null
                ScoreRow(ix, score(txt, tokens))
            }
            .sortedWith(
                compareByDescending<ScoreRow> { it.score }
                    .thenBy { it.ix.tokenCount }
                    .thenBy { it.ix.p.name.length },
            )
            .map { it.ix }
            .toList()
    }

    private fun score(txt: String, tokens: List<String>): Int {
        var s = 0
        for (t in tokens) {
            s += when {
                txt.startsWith(t) -> 3
                txt.contains(" $t") -> 2
                else -> 1
            }
        }
        if (tokens.size >= 2) {
            val ordered = (0 until tokens.size - 1).all { i ->
                txt.indexOf(tokens[i]) < txt.indexOf(tokens[i + 1])
            }
            if (ordered) s += 5
        }
        return s
    }

    private data class ScoreRow(val ix: Indexed, val score: Int)
}
