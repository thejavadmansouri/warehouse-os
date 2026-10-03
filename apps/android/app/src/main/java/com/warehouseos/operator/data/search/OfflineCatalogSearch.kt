package com.warehouseos.operator.data.search

import com.warehouseos.operator.data.local.CatalogProductEntity

/**
 * In-memory ranked search over the offline catalog — a faithful port of the
 * server's POS pipeline (`rankIds` → byTokens → bySubstring → one-less):
 *
 *  1. exact code (sku / partNumber / barcode)
 *  2. full token-set containment (every query token in searchTokens)
 *  3. substring match on the joined token text
 *  4. one-less: drop each token in turn and retry substring
 *
 * Result order and limits match the web POS (100 max, substring stage runs
 * while results < 20).
 *
 * Speed: the token/barcode strings are split ONCE per query into [Indexed]
 * (the split per comparison was the dominant cost — 33k rows × several stages
 * × per-token re-splitting). The comparisons themselves are unchanged, so the
 * ranking is byte-for-byte the same as before.
 */
object OfflineCatalogSearch {

    private const val MAX_RESULTS = 100
    private const val SUBSTRING_THRESHOLD = 20

    /** Builds the reusable index. Do this once per catalog load, never per query. */
    fun index(products: List<CatalogProductEntity>): List<Indexed> = products.map { Indexed(it) }

    /**
     * Convenience for callers that hold raw rows (tests). Indexes on every call,
     * so never use it on a hot path — [index] once and call [search] instead.
     */
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

        // 1) exact code — sku / partNumber / barcode
        push(
            indexed.filter { ix ->
                ix.p.sku == q ||
                    ix.p.partNumber == q ||
                    ix.barcodes.contains(q)
            },
            MAX_RESULTS,
        )

        // 2) full token-set containment
        push(byTokens(indexed, tokens), MAX_RESULTS)

        // 3) substring — generous threshold like the server
        if (out.size < SUBSTRING_THRESHOLD) {
            push(bySubstring(indexed, tokens), MAX_RESULTS)

            // 4) one-less — an extra/wrong word must not zero the result
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
     * Pre-split token/barcode fields.
     *
     * Built once per catalog load and reused for every keystroke. Rebuilding it
     * per query meant ~50k string splits + set/string allocations on every letter
     * typed, which is the single most expensive thing the worker app did.
     */
    class Indexed(val p: CatalogProductEntity) {
        private val tokenList: List<String> = p.tokenList()
        val tokens: Set<String> = tokenList.toSet()
        val joined: String = tokenList.joinToString(" ")
        val barcodes: Set<String> = p.barcodeList().toSet()
        val tokenCount: Int = tokenList.size
    }

    /** Full containment: every query token must be among the product's tokens. */
    private fun byTokens(
        indexed: List<Indexed>,
        tokens: List<String>,
    ): List<Indexed> {
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

    /** Every token must be a substring of the joined token text, ranked by score. */
    private fun bySubstring(
        indexed: List<Indexed>,
        tokens: List<String>,
    ): List<Indexed> {
        return indexed
            .mapNotNull { ix ->
                val txt = ix.joined
                if (!tokens.all { txt.contains(it) }) return@mapNotNull null
                val score = score(txt, tokens)
                ScoreRow(ix, score, txt)
            }
            .sortedWith(
                compareByDescending<ScoreRow> { it.score }
                    .thenBy { it.ix.tokenCount }
                    .thenBy { it.ix.p.name.length },
            )
            .map { it.ix }
    }

    private fun score(txt: String, tokens: List<String>): Int {
        var s = 0
        for (t in tokens) {
            s += when {
                txt.startsWith(t) -> 3 // prefix of the whole joined text
                txt.contains(" $t") -> 2 // whole-word match
                else -> 1
            }
        }
        // tokens must appear in order (meaningless for a single token)
        if (tokens.size >= 2) {
            val ordered = (0 until tokens.size - 1).all { i ->
                txt.indexOf(tokens[i]) < txt.indexOf(tokens[i + 1])
            }
            if (ordered) s += 5
        }
        // NB: server adds +2 for having stock — unknown offline, intentionally omitted.
        return s
    }

    private data class ScoreRow(
        val ix: Indexed,
        val score: Int,
        @Suppress("unused") val txt: String,
    )
}
