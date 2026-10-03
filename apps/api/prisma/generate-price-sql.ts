/**
 * ساخت یک فایل SQL قابل‌حمل برای به‌روزرسانی قیمت فروش کالاها روی سرور ویندوز،
 * از روی خروجی پارسیان (PRODUCTS-FINAL.xlsx).
 *
 * چرا SQL و نه اجرای مستقیم؟
 *  - سرور ویندوز psql.exe (داخل pgsql\bin) را دارد ولی ts-node ممکن است نباشد.
 *  - id محصول‌ها روی مک با سرور فرق دارد (هر کدام UUID خودشان)، پس نمی‌توان
 *    رکورد قیمت را با productId از اینجا آماده کرد. تطبیق باید روی خودِ سرور با
 *    SKU (کد حسابداری) انجام شود — همان کاری که این SQL می‌کند.
 *
 * قواعد (تصمیم‌های کاربر):
 *  - قیمت = «قيمت1» اگر بود، وگرنه «آخرين قيمت فروش».
 *  - قیمت‌ها ریال و عدد صحیح‌اند. چیزی ×۱۰ نمی‌شود.
 *  - قیمت‌های <= ۰ یا < حداقلِ منطقی (JUNK_BELOW ریال) آشغال‌اند (۱، ۳، ۵ ...) → رد.
 *  - تطبیق با SKU؛ کالای فایل که در دیتابیس نباشد به‌صورت طبیعی نادیده گرفته می‌شود
 *    (JOIN فقط SKUهای موجود را می‌گیرد).
 *  - برای هر کالا یک رکورد ProductPrice *جدید* درج می‌شود (سری‌زمانی).
 *  - idempotent: اگر آخرین قیمت فعلیِ همان کالا دقیقاً همین مقدار باشد، رد می‌شود؛
 *    پس اجرای دوباره‌ی فایل رکورد تکراری نمی‌سازد.
 *  - همه‌چیز داخل یک transaction است (BEGIN/COMMIT) → یا همه یا هیچ.
 *
 * اجرا (روی مک — فقط فایل می‌خواند و فایل می‌نویسد، دیتابیس لمس نمی‌شود):
 *   npx ts-node prisma/generate-price-sql.ts [in.xlsx] [out.sql]
 * پیش‌فرض‌ها:
 *   in.xlsx = /Users/proman/Downloads/PRODUCTS-FINAL.xlsx
 *   out.sql = /Users/proman/Downloads/update-prices.sql
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';

/** قیمت کمتر از این (ریال) آشغال است؛ ۱۰٬۰۰۰ ریال = ۱۰۰۰ تومان. */
const JUNK_BELOW = 10_000;

/** اندازه‌ی هر بلوک VALUES در فایل خروجی، فقط برای خوانایی. */
const CHUNK = 1000;

/** ي/ك عربی → ی/ک فارسی، برای تطبیق مطمئنِ نام ستون‌ها. */
function normalizeHeader(s: string): string {
  return s
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

type Row = Record<string, unknown>;

/** کلید هدر واقعی را با تطبیق نرمال‌شده پیدا می‌کند (گلیف عربی/فارسی مهم نیست). */
function findKey(headers: string[], match: (norm: string) => boolean): string {
  const hit = headers.find((h) => match(normalizeHeader(h)));
  if (!hit) {
    throw new Error(
      `ستون موردنظر در هدر پیدا نشد. هدرهای موجود: ${headers.join(' | ')}`,
    );
  }
  return hit;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const inPath = args[0] ?? '/Users/proman/Downloads/PRODUCTS-FINAL.xlsx';
  const outPath = args[1] ?? '/Users/proman/Downloads/update-prices.sql';

  console.log(`ورودی : ${inPath}`);
  console.log(`خروجی : ${outPath}`);
  console.log('─'.repeat(70));

  const wb = XLSX.readFile(inPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
  if (rows.length === 0) throw new Error('شیت خالی است.');

  const headers = Object.keys(rows[0]);
  const codeKey = findKey(headers, (n) => n === 'کد کالا');
  const price1Key = findKey(headers, (n) => n === 'قیمت1');
  const lastKey = findKey(
    headers,
    (n) => n.includes('آخرین') && n.includes('فروش'),
  );

  // سه‌گانه: (sku, price, منبع)
  const priced: Array<{ sku: string; price: number }> = [];
  const seen = new Set<string>();
  let noCode = 0;
  let dupSku = 0;
  let noPrice = 0;
  let junk = 0;
  let fromP1 = 0;
  let fromLast = 0;

  for (const r of rows) {
    const rawCode = r[codeKey];
    const sku = rawCode == null ? '' : String(rawCode).trim();
    if (!sku || sku === '0') {
      noCode++;
      continue;
    }
    if (seen.has(sku)) {
      dupSku++;
      continue;
    }
    seen.add(sku);

    const p1 = toInt(r[price1Key]);
    const last = toInt(r[lastKey]);
    let price: number | null = null;
    let src: 'p1' | 'last' | null = null;
    if (p1 !== null && p1 > 0) {
      price = p1;
      src = 'p1';
    } else if (last !== null && last > 0) {
      price = last;
      src = 'last';
    }

    if (price === null) {
      noPrice++;
      continue;
    }
    if (price < JUNK_BELOW) {
      junk++;
      continue;
    }

    priced.push({ sku, price });
    if (src === 'p1') fromP1++;
    else fromLast++;
  }

  // گزارش
  console.log(`ردیف کل فایل            : ${rows.length}`);
  console.log(`بدون کد / کد صفر        : ${noCode}`);
  console.log(`کد تکراری               : ${dupSku}`);
  console.log(`بدون هیچ قیمت           : ${noPrice}`);
  console.log(`قیمت آشغال (< ${JUNK_BELOW.toLocaleString()}) : ${junk}`);
  console.log('─'.repeat(70));
  console.log(`قیمت‌دار برای نوشتن     : ${priced.length}`);
  console.log(`  از «قيمت1»            : ${fromP1}`);
  console.log(`  از «آخرين قيمت فروش»  : ${fromLast}`);
  console.log('─'.repeat(70));
  console.log('۱۵ نمونه (sku → قیمت ریال):');
  for (const p of priced.slice(0, 15)) {
    console.log(`  ${p.sku} → ${p.price.toLocaleString()}`);
  }
  console.log('─'.repeat(70));

  // ساخت SQL
  const parts: string[] = [];
  parts.push('-- update-prices.sql');
  parts.push('-- ساخته‌شده از PRODUCTS-FINAL.xlsx. قیمت‌ها ریال. تطبیق با SKU.');
  parts.push(`-- تعداد کالای قیمت‌دار: ${priced.length}`);
  parts.push('-- اجرا روی سرور ویندوز (نمونه):');
  parts.push(
    '--   "C:\\WarehouseOS\\pgsql\\bin\\psql.exe" -h localhost -U postgres -d warehouse_os -v ON_ERROR_STOP=1 -f update-prices.sql',
  );
  parts.push('');
  parts.push('BEGIN;');
  parts.push('');
  parts.push(
    'CREATE TEMP TABLE _incoming_price (sku text PRIMARY KEY, price integer NOT NULL) ON COMMIT DROP;',
  );
  parts.push('');

  for (let i = 0; i < priced.length; i += CHUNK) {
    const slice = priced.slice(i, i + CHUNK);
    const values = slice
      // sku فقط رقم است پس نیازی به escape ندارد، ولی برای امنیت هم چک می‌شود.
      .map((p) => `  ('${p.sku.replace(/'/g, "''")}', ${p.price})`)
      .join(',\n');
    parts.push(`INSERT INTO _incoming_price (sku, price) VALUES\n${values}\nON CONFLICT (sku) DO NOTHING;`);
    parts.push('');
  }

  parts.push('-- گزارش پیش از درج: چند کد با محصول واقعی تطبیق خورد.');
  parts.push(
    "\\echo 'کدهای فایل که با محصول موجود تطبیق خوردند:'",
  );
  parts.push(
    'SELECT count(*) AS matched FROM _incoming_price s JOIN "Product" p ON p.sku = s.sku;',
  );
  parts.push('');
  parts.push('-- درج رکورد قیمت جدید فقط وقتی آخرین قیمت فعلی با قیمت جدید فرق دارد.');
  parts.push('INSERT INTO "ProductPrice" (id, "productId", "salePrice", "createdAt")');
  parts.push('SELECT gen_random_uuid()::text, p.id, s.price, now()');
  parts.push('FROM _incoming_price s');
  parts.push('JOIN "Product" p ON p.sku = s.sku');
  parts.push('LEFT JOIN LATERAL (');
  parts.push('  SELECT pp."salePrice" AS last_price');
  parts.push('  FROM "ProductPrice" pp');
  parts.push('  WHERE pp."productId" = p.id');
  parts.push('  ORDER BY pp."createdAt" DESC');
  parts.push('  LIMIT 1');
  parts.push(') latest ON true');
  parts.push('WHERE latest.last_price IS DISTINCT FROM s.price;');
  parts.push('');
  parts.push("\\echo 'رکوردهای قیمتِ درج‌شده در این اجرا (بالا) — اگر ۰ بود یعنی همه از قبل به‌روز بودند.'");
  parts.push('');
  parts.push('COMMIT;');
  parts.push('');

  fs.writeFileSync(outPath, parts.join('\n'), 'utf8');
  const bytes = fs.statSync(outPath).size;
  console.log(`✓ نوشته شد: ${outPath}  (${(bytes / 1024).toFixed(0)} KB)`);
  console.log('این فایل هیچ دیتابیسی را اینجا لمس نکرد. برای اجرا روی سرور، همین فایل را ببر.');
}

main();
