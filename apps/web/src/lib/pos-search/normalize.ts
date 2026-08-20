/**
 * Canonical Persian normalizer + query tokenizer for the POS local search.
 *
 * The character-level rules are a byte-for-byte port of the server's
 * `apps/api/src/engine/utils/persian-normalize.ts` + `products/search-tokens.ts`
 * (and the Android `PersianText.kt`). All must stay identical, otherwise a
 * product the server would return is missed locally — the whole point of local
 * search is that the seller sees exactly what the server would have returned.
 *
 * `normalizeWithMap` is the canonical implementation; `normalizePersian` is
 * derived from it (`.normalized`) so the two can never drift apart — a search
 * highlight bug once traced back to two copies of "the same" regex silently
 * diverging is the reason this is one function, not two.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ARABIC_TO_PERSIAN: Record<string, string> = { ي: "ی", ى: "ی", ك: "ک", ة: "ه" };

// Same literal character classes as the server's persian-normalize.ts, tested
// per-character here instead of via a single global .replace().
const IS_TASHKIL = /[ً-ْـ]/; // harakat (U+064B-U+0652) + tatweel (U+0640)
const IS_ZERO_WIDTH = /[​‍‎‏﻿]/; // ZWSP, ZWJ, LRM, RLM, BOM — removed, not mapped
const ZWNJ = "‌"; // U+200C — becomes a space, not removed

export interface NormalizedWithMap {
  normalized: string;
  /**
   * map[i] = index into the NFC-normalized source string that produced
   * normalized[i]. Used to translate a match found in normalized text back to
   * a highlightable range in the original display string.
   *
   * Known simplification: built against `input.normalize("NFC")`, not the raw
   * `input` — NFC can rarely change length (combining-character composition),
   * which this does not track further. For Persian catalog names (already
   * near-canonical Unicode from the database) this never matters in practice.
   */
  map: number[];
}

/** Canonical normalizer with a position map back to the source string. */
export function normalizeWithMap(input?: string | null): NormalizedWithMap {
  if (!input) return { normalized: "", map: [] };

  const src = input.normalize("NFC");
  const chars: string[] = [];
  const map: number[] = [];

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (IS_TASHKIL.test(c) || IS_ZERO_WIDTH.test(c)) continue; // removed entirely

    if (c === ZWNJ) {
      chars.push(" ");
      map.push(i);
      continue;
    }

    const arabicToPersian = ARABIC_TO_PERSIAN[c];
    if (arabicToPersian) {
      chars.push(arabicToPersian);
      map.push(i);
      continue;
    }

    const faDigit = FA_DIGITS.indexOf(c);
    if (faDigit >= 0) {
      chars.push(String(faDigit));
      map.push(i);
      continue;
    }

    const arDigit = AR_DIGITS.indexOf(c);
    if (arDigit >= 0) {
      chars.push(String(arDigit));
      map.push(i);
      continue;
    }

    // Latin fragments arrive both ways (تکستار / Textar); per-char lowercase
    // is length-preserving for the ASCII range this catalog actually uses.
    chars.push(c.toLowerCase());
    map.push(i);
  }

  // Collapse runs of whitespace to a single space (mirrors /\s+/ -> " "),
  // keeping the map pointed at the FIRST original character of each run.
  const collapsed: string[] = [];
  const collapsedMap: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < chars.length; i++) {
    const isSpace = /\s/.test(chars[i]);
    if (isSpace) {
      if (lastWasSpace) continue;
      collapsed.push(" ");
      collapsedMap.push(map[i]);
      lastWasSpace = true;
    } else {
      collapsed.push(chars[i]);
      collapsedMap.push(map[i]);
      lastWasSpace = false;
    }
  }

  // Trim leading/trailing space (mirrors .trim()).
  let start = 0;
  let end = collapsed.length;
  while (start < end && collapsed[start] === " ") start++;
  while (end > start && collapsed[end - 1] === " ") end--;

  return {
    normalized: collapsed.slice(start, end).join(""),
    map: collapsedMap.slice(start, end),
  };
}

/** Idempotent by construction: normalizePersian(normalizePersian(x)) === normalizePersian(x). */
export function normalizePersian(input?: string | null): string {
  return normalizeWithMap(input).normalized;
}

/**
 * Same normalization, split on separators, drop single-char noise tokens.
 * Mirrors the server's `tokenizeQuery`.
 */
export function tokenizeQuery(input: string): string[] {
  const normalized = normalizePersian(input);
  if (!normalized) return [];

  return normalized
    .split(/[\s/(),._-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}
