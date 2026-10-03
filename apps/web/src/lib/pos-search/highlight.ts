import { normalizePersian, normalizeWithMap } from "./normalize";

/**
 * Splits a display string into plain/matched segments so the UI can render
 * the matched query words in a highlight color — Persian-normalization aware,
 * so "پراید" highlights inside "پراید" even through Arabic-letter/digit
 * variants, ZWNJ, or extra whitespace in the stored name.
 *
 * Concatenating every segment's `text` always reproduces the (NFC-normalized)
 * original string exactly — this function only marks ranges, it never edits,
 * reorders, or drops any character the seller would see.
 */

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/**
 * Finds every occurrence of each token in `text` and returns it split into
 * segments. `tokens` should be the tokenized SEARCH QUERY (e.g.
 * `tokenizeQuery(liveQuery)`) — not the item's own tokens — so a result found
 * via the lenient "one-less" stage still only highlights the words that are
 * actually present in ITS name; a token absent from this particular name
 * simply produces no range for it, no special-casing needed by the caller.
 */
export function highlightMatches(text: string, tokens: string[]): HighlightSegment[] {
  if (!text || tokens.length === 0) return [{ text, matched: false }];

  const { normalized, map } = normalizeWithMap(text);
  if (!normalized) return [{ text, matched: false }];

  // Segments are cut from the SAME NFC-normalized string normalizeWithMap used
  // to build the map, so `map[i]` indices stay valid for slicing it.
  const src = text.normalize("NFC");

  const ranges: [number, number][] = [];
  for (const raw of tokens) {
    const token = normalizePersian(raw);
    if (!token) continue;

    let from = 0;
    while (from <= normalized.length - token.length) {
      const at = normalized.indexOf(token, from);
      if (at === -1) break;
      const start = map[at];
      const end = map[at + token.length - 1] + 1;
      ranges.push([start, end]);
      from = at + 1;
    }
  }
  if (ranges.length === 0) return [{ text: src, matched: false }];

  // Merge overlapping/adjacent ranges so two matched words that touch don't
  // render as separately-colored fragments.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: src.slice(cursor, start), matched: false });
    segments.push({ text: src.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < src.length) segments.push({ text: src.slice(cursor), matched: false });
  return segments;
}
