/**
 * Port of OfflineCatalogSearch + PersianText against the phone's Room DB.
 * Usage: node tools/simulate-offline-search.mjs [dbPath] [query...]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SQLITE =
  process.env.SQLITE3 ||
  'C:\\Users\\K\\AppData\\Local\\AndroidBuild\\android-sdk\\platform-tools\\sqlite3.exe';
const db = process.argv[2] || join(process.env.TEMP || tmpdir(), 'op.db');
const queries =
  process.argv.slice(3).length > 0
    ? process.argv.slice(3)
    : [
        'آرم جلو پنجره اراد پارت',
        'ارم جلو پنجره اراد پارت',
        'لنت ترمز پراید',
        'ترموستات',
        'ارم پارس',
      ];

const ARABIC_TO_PERSIAN = {
  ي: 'ی',
  ى: 'ی',
  ك: 'ک',
  ة: 'ه',
  آ: 'ا',
  أ: 'ا',
  إ: 'ا',
  ٱ: 'ا',
  ؤ: 'و',
  ئ: 'ی',
};
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
const TASHKIL = /[\u064B-\u0652\u0640]/g;
const ZWNJ = /\u200C/g;
const ZW = /[\u200B\u200D\u200E\u200F\uFEFF]/g;
const WS = /\s+/g;
const SPLIT = /[\s/(),._\-]+/;

function normalize(input) {
  if (!input) return '';
  let t = input.normalize('NFC');
  t = [...t].map((c) => ARABIC_TO_PERSIAN[c] || c).join('');
  t = [...t]
    .map((c) => {
      const fi = FA.indexOf(c);
      if (fi >= 0) return String(fi);
      const ai = AR.indexOf(c);
      if (ai >= 0) return String(ai);
      return c;
    })
    .join('');
  t = t.replace(TASHKIL, '').replace(ZWNJ, ' ').replace(ZW, '').toLowerCase();
  return t.replace(WS, ' ').trim();
}

function tokenizeQuery(input) {
  const n = normalize(input);
  if (!n) return [];
  return n
    .split(SPLIT)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function loadRows() {
  const sqlPath = join(tmpdir(), 'cat-dump.sql');
  writeFileSync(
    sqlPath,
    "SELECT id, name, sku, IFNULL(partNumber,''), searchTokens, barcodes FROM catalog_product WHERE deleted=0;\n",
    'utf8',
  );
  const r = spawnSync(SQLITE, [db, '-separator', '\t', `.read ${sqlPath}`], {
    encoding: 'buffer',
    maxBuffer: 80 * 1024 * 1024,
  });
  try {
    unlinkSync(sqlPath);
  } catch {}
  if (r.status !== 0) {
    console.error(r.stderr?.toString() || 'sqlite failed');
    process.exit(1);
  }
  const text = r.stdout.toString('utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 6) continue;
    const [id, name, sku, partNumber, searchTokens, barcodes] = parts;
    const tokenList = (searchTokens || '')
      .split('\u0001')
      .map((t) => normalize(t))
      .filter((t) => t.length > 1);
    rows.push({
      id,
      name,
      sku,
      partNumber,
      tokens: new Set(tokenList),
      joined: tokenList.join(' '),
      barcodes: new Set(
        (barcodes || '')
          .split('\u0001')
          .map((b) => normalize(b))
          .filter(Boolean),
      ),
      skuNorm: normalize(sku),
      partNorm: normalize(partNumber),
      tokenCount: tokenList.length,
    });
  }
  return rows;
}

function search(indexed, query) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = tokenizeQuery(q);
  if (!tokens.length) return [];
  const out = [];
  const seen = new Set();
  const push = (list, limit) => {
    for (const ix of list) {
      if (seen.has(ix.id)) continue;
      seen.add(ix.id);
      out.push(ix);
      if (out.length >= limit) return;
    }
  };
  push(
    indexed.filter(
      (ix) => ix.skuNorm === q || ix.partNorm === q || ix.barcodes.has(q),
    ),
    100,
  );
  const byTokens = indexed
    .filter((ix) => tokens.every((t) => ix.tokens.has(t)))
    .sort((a, b) => {
      const an = normalize(a.name) !== tokens.join(' ');
      const bn = normalize(b.name) !== tokens.join(' ');
      if (an !== bn) return an - bn;
      if (a.tokenCount !== b.tokenCount) return a.tokenCount - b.tokenCount;
      return a.name.length - b.name.length;
    });
  push(byTokens, 100);
  if (out.length < 20) {
    const bySub = (toks) => {
      const key = toks.reduce((a, b) => (a.length >= b.length ? a : b));
      return indexed
        .filter((ix) => ix.joined.includes(key))
        .map((ix) => {
          if (!toks.every((t) => ix.joined.includes(t))) return null;
          let s = 0;
          for (const t of toks) {
            if (ix.joined.startsWith(t)) s += 3;
            else if (ix.joined.includes(' ' + t)) s += 2;
            else s += 1;
          }
          return { ix, s };
        })
        .filter(Boolean)
        .sort((a, b) => b.s - a.s || a.ix.tokenCount - b.ix.tokenCount)
        .map((x) => x.ix);
    };
    push(bySub(tokens), 100);
    if (out.length < 20 && tokens.length >= 2) {
      for (let skip = 0; skip < tokens.length; skip++) {
        if (out.length >= 100) break;
        push(
          bySub(tokens.filter((_, i) => i !== skip)),
          100,
        );
      }
    }
  }
  return out.slice(0, 100);
}

console.log('DB', db);
const indexed = loadRows();
console.log('rows', indexed.length);
for (const q of queries) {
  const t0 = Date.now();
  const hits = search(indexed, q);
  const ms = Date.now() - t0;
  console.log(`\nQ: ${q}`);
  console.log(`hits=${hits.length} ms=${ms} tokens=${JSON.stringify(tokenizeQuery(q))}`);
  for (const h of hits.slice(0, 5)) {
    console.log(' -', h.name, '|', h.sku);
  }
}
