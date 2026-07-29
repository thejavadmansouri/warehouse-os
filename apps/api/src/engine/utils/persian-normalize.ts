/**
 * Canonical Persian text normalizer — the single source of truth used for BOTH
 * stored dictionary entries and spoken tokens, so they compare equal.
 *
 * Idempotent by construction: normalizePersian(normalizePersian(x)) === normalizePersian(x).
 *
 * Does: Arabic→Persian letters, Persian/Arabic digits→ASCII, strip tashkil/tatweel
 * and zero-width/bidi marks (ZWNJ→space, others removed), Unicode NFC, Latin
 * casefold, whitespace collapse. Keep the original elsewhere for display.
 */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizePersian(input?: string | null): string {
  if (!input) return '';

  let t = input.normalize('NFC');

  // Arabic → Persian letters
  t = t
    .replace(/[يى]/g, 'ی') // ي ى → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/ة/g, 'ه'); // ة → ه

  // Persian / Arabic-Indic digits → ASCII
  t = t
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

  // Tashkil (harakat, U+064B–U+0652) + tatweel (U+0640)
  t = t.replace(/[ً-ْـ]/g, '');

  // ZWNJ (نیم‌فاصله, U+200C) → space; other zero-width / bidi marks → removed
  t = t
    .replace(/‌/g, ' ')
    .replace(/[​‍‎‏﻿]/g, '');

  // Latin fragments arrive both ways (تکستار / Textar)
  t = t.toLowerCase();

  return t.replace(/\s+/g, ' ').trim();
}
