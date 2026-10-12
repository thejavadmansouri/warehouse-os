/**
 * عدد درشت کنار QR روی لیبل قفسه (همان منطق 100200_big):
 * از نام («باکس ۵») یا کد، آخرین گروه رقم را برمی‌دارد.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toAsciiDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (ch) => String(FA_DIGITS.indexOf(ch)));
}

/** گروه رقم لاتین یا فارسی */
const NUM_RE = /[0-9۰-۹]+/g;

export function shelfDisplayNumber(name: string, code: string): string {
  const nameHits = String(name ?? '').match(NUM_RE);
  if (nameHits?.length) return toAsciiDigits(nameHits[nameHits.length - 1]!);

  const bare = String(code ?? '').trim();
  if (/^[0-9۰-۹]+$/.test(bare)) return toAsciiDigits(bare);

  const codeHits = bare.match(NUM_RE);
  if (codeHits?.length) return toAsciiDigits(codeHits[codeHits.length - 1]!);

  return bare.slice(0, 8) || '?';
}
