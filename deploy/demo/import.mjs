#!/usr/bin/env node
/**
 * کاردو — داده‌ی نمایشی، فقط از راه HTTP.
 *
 * چرا از API و نه مستقیم در دیتابیس: هر فاکتور واقعی، موجودی، دفترِ مشتری و
 * سندِ حسابداری را با خودش می‌سازد. اگر ردیف‌ها را دستی در جدول‌ها می‌ریختیم،
 * داشبورد و مانده‌ها عددهایی نشان می‌دادند که هیچ سندی پشتشان نبود — و اولین
 * کاری که کسی در دمو می‌کند، همان «چرا جمعش نمی‌خواند» است.
 *
 * فقط ماژول‌های داخلیِ Node 24 (fetch/fs) — روی لپ‌تاپِ مقصد، همین `node.exe`
 * داخلِ کیت اجرایش می‌کند و هیچ نصبی لازم نیست.
 *
 * اجرا:
 *   node import.mjs --api=http://127.0.0.1:3000 --password=XXXX [--profile=full|small]
 *                   [--psql=<path>] [--database-url=<url>] [--skip-backdate]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ args */
const argv = process.argv.slice(2);
const args = {};
for (const a of argv) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}

const here = dirname(fileURLToPath(import.meta.url));
const API = String(args.api ?? process.env.KARDO_API ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const PASSWORD = String(args.password ?? process.env.KARDO_PASSWORD ?? '');
const PROFILE = String(args.profile ?? 'full');
const SKIP_BACKDATE = args['skip-backdate'] === true;
const PSQL = args.psql ? String(args.psql) : null;
const DATABASE_URL = args['database-url'] ? String(args['database-url']) : null;
/** تاریخ‌ها تا این تعداد روز به عقب پخش می‌شوند (داشبورد و نمودارها خالی نمانند). */
const SPREAD_DAYS = Number(args['spread-days'] ?? 90);

const full = {
  warehouses: 10,
  floors: 10,
  rows: 4,
  bins: 4,
  products: 1200,
  customers: 120,
  invoices: 300,
  quotations: 100,
  returns: 8,
  users: 8,
  transfers: 30,
  adjustments: 40,
};
const small = {
  warehouses: 2,
  floors: 3,
  rows: 2,
  bins: 2,
  products: 40,
  customers: 8,
  invoices: 6,
  quotations: 3,
  returns: 1,
  users: 2,
  transfers: 2,
  adjustments: 2,
};
const P = PROFILE === 'small' ? small : full;

/* ----------------------------------------------------------------- utils */
const t0 = Date.now();
let token = null;
let stepNo = 0;

function say(msg) {
  console.log(`\n\u001b[36m==== ${msg}\u001b[0m`);
}
function ok(msg) {
  console.log(`  \u001b[32mOK\u001b[0m  ${msg}`);
}
function warn(msg) {
  console.log(`  \u001b[33m!!\u001b[0m  ${msg}`);
}
function step(msg) {
  stepNo++;
  process.stdout.write(`  ${String(stepNo).padStart(4)} ${msg}\r`);
}

class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} → ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(method, path, res.status, data);
  return data;
}

/** RNG با دانه‌ی ثابت — هر بار اجرا، همان مجموعه (نتیجه قابل تکرار). */
let seed = 20261025;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}
function roundTo(n, step) {
  return Math.max(step, Math.round(n / step) * step);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------------------------------------------- catalog */
const BRANDS = [
  ['بوش', 1.45], ['تکستار', 1.0], ['والئو', 1.35], ['لوک', 1.4], ['ساکس', 1.3],
  ['مان', 1.25], ['فرام', 1.1], ['ان‌جی‌کی', 1.2], ['دنسو', 1.3], ['کروز', 0.85],
  ['عظام', 0.9], ['ایساکو', 0.95], ['سایپا یدک', 0.8], ['دیناپارت', 0.85],
  ['موتورژن', 0.75], ['سرمر', 0.9], ['ام‌کی‌کی', 0.8], ['آفرام', 0.95],
  ['پارس لنت', 0.85], ['جهان لنت', 0.8], ['مهرکام پارس', 0.9], ['کوشا پیشرو', 0.85],
  ['پیربرگ', 1.3], ['ماهل', 1.35], ['گتس', 1.25], ['دایکو', 1.15], ['کنپارس', 1.0],
  ['شرکتی', 1.15], ['متفرقه', 0.7], ['بدون برند', 0.6],
];

/** خانواده‌های یدکی با محدوده‌ی قیمت خرید (ریال) و واحد فروش. */
const FAMILIES = [
  ['لنت ترمز جلو', 'عدد', 850_000], ['لنت ترمز عقب', 'عدد', 700_000],
  ['دیسک ترمز جلو', 'عدد', 2_400_000], ['دیسک ترمز عقب', 'عدد', 1_900_000],
  ['کالیپر ترمز', 'عدد', 4_800_000], ['سیلندر ترمز چرخ', 'عدد', 780_000],
  ['فیلتر روغن', 'عدد', 240_000], ['فیلتر هوا', 'عدد', 320_000],
  ['فیلتر کابین', 'عدد', 380_000], ['فیلتر بنزین', 'عدد', 450_000],
  ['واشر سرسیلندر', 'عدد', 950_000], ['واشر کارتل', 'عدد', 180_000],
  ['تسمه تایم', 'عدد', 1_150_000], ['تسمه دینام', 'عدد', 480_000],
  ['تسمه کولر', 'عدد', 390_000], ['تسمه سفت‌کن', 'عدد', 1_450_000],
  ['شمع', 'عدد', 320_000], ['وایر شمع', 'دست', 1_250_000],
  ['کویل', 'عدد', 2_100_000], ['دلکو', 'عدد', 3_600_000],
  ['استارت', 'عدد', 6_800_000], ['دینام', 'عدد', 7_400_000],
  ['واترپمپ', 'عدد', 2_300_000], ['ترموستات', 'عدد', 690_000],
  ['رادیاتور آب', 'عدد', 6_200_000], ['رادیاتور کولر', 'عدد', 4_500_000],
  ['فن خنک‌کننده', 'عدد', 3_900_000], ['پمپ بنزین', 'عدد', 3_200_000],
  ['صافی بنزین', 'عدد', 260_000], ['انژکتور', 'عدد', 2_700_000],
  ['کمک فنر جلو', 'عدد', 3_400_000], ['کمک فنر عقب', 'عدد', 2_900_000],
  ['سیبک فرمان', 'عدد', 680_000], ['طبق جلو', 'عدد', 1_850_000],
  ['بوش طبق', 'عدد', 340_000], ['گردگیر پلوس', 'عدد', 290_000],
  ['پلوس کامل', 'عدد', 4_200_000], ['دیسک و صفحه کلاچ', 'دست', 5_600_000],
  ['بلبرینگ چرخ', 'عدد', 890_000], ['شیر کلاچ', 'عدد', 1_100_000],
  ['دینام استارت', 'عدد', 6_100_000], ['کمپرسور کولر', 'عدد', 9_500_000],
  ['دربادگیر', 'عدد', 1_050_000], ['پمپ هیدرولیک فرمان', 'عدد', 8_200_000],
  ['روغن موتور', 'گالن', 1_450_000], ['ضدیخ', 'گالن', 780_000],
  ['روغن ترمز', 'عدد', 320_000], ['گریس', 'عدد', 420_000],
  ['آینه بغل', 'عدد', 1_350_000], ['چراغ جلو', 'عدد', 2_600_000],
  ['چراغ عقب', 'عدد', 2_100_000], ['لامپ', 'عدد', 120_000],
  ['برف‌پاک‌کن', 'عدد', 390_000], ['بوق', 'عدد', 480_000],
  ['لاستیک', 'عدد', 4_900_000], ['تسمه ایمنی', 'عدد', 3_200_000],
  ['فیلتر گیربکس', 'عدد', 540_000], ['واشر درب سوپاپ', 'عدد', 690_000],
  ['دسته موتور', 'عدد', 1_250_000], ['میل‌لنگ', 'عدد', 9_800_000],
];

const VEHICLES = [
  'پراید 131', 'پراید 111', 'پراید 132', 'پراید 141', 'پراید 151', 'تیبا',
  'تیبا 2', 'ساینا', 'کوییک', 'شاهین', 'پژو 206 تیپ 2', 'پژو 206 تیپ 5',
  'پژو 405', 'پژو پارس', 'سمند LX', 'سمند EF7', 'دنا', 'رانا', 'آریسان',
  'هایما S7', 'تیارا', 'کوییک R', 'وندر', 'سورن', 'فولکس گل', 'رنو ال 90',
  'شاهین پلاس', 'پژو 207', 'تارا', 'آسنا',
];

/** کاتالوگ: خانواده × خودرو × برند، تا سقفِ خواسته‌شده و بدونِ نامِ تکراری. */
function buildCatalog(target) {
  const out = [];
  const seen = new Set();
  const units = new Set();
  let guard = 0;
  while (out.length < target && guard++ < target * 40) {
    const [family, unit, base] = pick(FAMILIES);
    const vehicle = pick(VEHICLES);
    const [brand, factor] = pick(BRANDS);
    const name = `${family} ${vehicle} — ${brand}`;
    if (seen.has(name)) continue;
    seen.add(name);
    units.add(unit);

    const purchase = roundTo(base * factor * (0.85 + rnd() * 0.4), 10_000);
    out.push({
      name,
      unit,
      brand,
      family,
      vehicle,
      purchasePrice: purchase,
      salePrice: roundTo(purchase * (1.22 + rnd() * 0.28), 10_000),
      wholesalePrice: roundTo(purchase * (1.12 + rnd() * 0.1), 10_000),
      managerPrice: roundTo(purchase * (1.05 + rnd() * 0.08), 10_000),
      minStock: int(1, 6),
      sku: `P-${String(out.length + 1).padStart(4, '0')}`,
    });
  }
  return out;
}

/* ------------------------------------------------------------ name banks */
const FIRST = [
  'رضا', 'محمد', 'علی', 'حسین', 'مهدی', 'امیر', 'سعید', 'حمید', 'مجید', 'فرهاد',
  'بهرام', 'کاظم', 'ناصر', 'یدالله', 'اکبر', 'جواد', 'مرتضی', 'اسماعیل', 'قاسم', 'رحیم',
  'فاطمه', 'زهرا', 'مریم', 'نرگس', 'سمیرا', 'الهام', 'شیرین', 'مینا', 'پریسا', 'آزاده',
];
const LAST = [
  'محمدی', 'احمدی', 'رضایی', 'حسینی', 'کریمی', 'موسوی', 'جعفری', 'صادقی', 'قاسمی', 'نوری',
  'شریفی', 'کاظمی', 'اکبری', 'ملکی', 'طاهری', 'رحیمی', 'یوسفی', 'سلیمی', 'براتی', 'خانی',
  'عزیزی', 'مرادی', 'زمانی', 'فرهادی', 'باقری', 'نیک‌پور', 'پاکدل', 'دهقان', 'سهرابی', 'امینی',
];
const SHOP_PREFIX = [
  'لوازم یدکی', 'یدکی فروشی', 'اتوگالری', 'تعمیرگاه', 'نمایندگی', 'پخش قطعات',
];
const CITIES = [
  'تهران', 'کرج', 'اصفهان', 'مشهد', 'شیراز', 'تبریز', 'قم', 'اهواز', 'رشت', 'کرمان',
];

function personName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}
function shopName() {
  return `${pick(SHOP_PREFIX)} ${pick(LAST)}`;
}
function phone() {
  return `09${int(10, 39)}${String(int(1000000, 9999999))}`;
}

/* ---------------------------------------------------------------- runner */
async function main() {
  console.log(`\n\u001b[35mکاردو — داده‌ی نمایشی\u001b[0m`);
  console.log(`  API:     ${API}`);
  console.log(`  پروفایل: ${PROFILE}`);

  // ---- اتصال
  say('ورود به سیستم');
  if (!PASSWORD) {
    console.error('  رمز مدیر را بدهید: --password=... یا متغیر KARDO_PASSWORD');
    process.exit(2);
  }
  const login = await api('POST', '/auth/login', { username: 'admin', password: PASSWORD });
  token = login.access_token;
  if (!token) throw new Error('login returned no token');
  ok('admin وارد شد');

  const health = await api('GET', '/health');
  ok(`API ${health.version ?? '?'} — دیتابیس ${health.db ?? '?'}`);

  /* ------------------------------------------------------------ 1) کاربران */
  say(`کاربران (${P.users})`);
  const ROLE_PLAN = [
    ['manager', 'MANAGER', 'مدیر فروش'],
    ['accountant', 'MANAGER', 'حسابدار'],
    ['seller1', 'SALES', 'فروشنده — صندوق ۱'],
    ['seller2', 'SALES', 'فروشنده — صندوق ۲'],
    ['seller3', 'SALES', 'فروشنده — صندوق ۳'],
    ['anbardar1', 'STAFF', 'انباردار — مرکزی'],
    ['anbardar2', 'STAFF', 'انباردار — شعبه ۲'],
    ['control', 'STAFF', 'کنترل کیفیت'],
  ];
  const users = [];
  for (let i = 0; i < Math.min(P.users, ROLE_PLAN.length); i++) {
    const [username, role, fullName] = ROLE_PLAN[i];
    try {
      const u = await api('POST', '/users', { username, password: 'demo1234', fullName, role });
      users.push(u);
      step(`کاربر ${username}`);
    } catch (e) {
      if (e.status === 409 || /exist/i.test(String(e.body?.message))) {
        step(`کاربر ${username} از قبل بود`);
      } else throw e;
    }
  }
  ok(`${users.length} کاربر تازه — رمز همه: demo1234`);

  /* ----------------------------------------------------------- 2) انبارها */
  say(`انبارها (${P.warehouses} انبار × ${P.floors} طبقه)`);
  const warehouses = [];
  const WAREHOUSE_NAMES = [
    ['انبار مرکزی', 'W01'], ['انبار شمال', 'W02'], ['انبار جنوب', 'W03'],
    ['انبار غرب', 'W04'], ['انبار شرق', 'W05'], ['انبار ضایعات و مرجوعی', 'W06'],
    ['انبار فروشگاه', 'W07'], ['انبار شعبه ۲', 'W08'], ['انبار قطعات سنگین', 'W09'],
    ['انبار رزرو و پیش‌فاکتور', 'W10'],
  ];
  for (let i = 0; i < P.warehouses; i++) {
    const [name, code] = WAREHOUSE_NAMES[i] ?? [`انبار ${i + 1}`, `W${String(i + 1).padStart(2, '0')}`];
    const w = await api('POST', '/warehouses', { name, code });
    warehouses.push({ ...w, name, code, floors: [] });
    step(name);
  }
  ok(`${warehouses.length} انبار`);

  // ---- درختِ موقعیت‌ها: طبقه → ردیف → قفسه، برای هر انبار
  say('موقعیت‌های انبار (طبقه → ردیف → قفسه)');
  let locCount = 0;
  for (const w of warehouses) {
    const typeFloor = await api('POST', '/location-types', { warehouseId: w.id, name: 'طبقه', depth: 0 });
    const typeRow = await api('POST', '/location-types', { warehouseId: w.id, name: 'ردیف', depth: 1 });
    const typeBin = await api('POST', '/location-types', { warehouseId: w.id, name: 'قفسه', depth: 2 });

    for (let f = 1; f <= P.floors; f++) {
      const floor = await api('POST', '/locations', {
        name: `طبقه ${f}`,
        typeId: typeFloor.id,
        warehouseId: w.id,
        code: `${w.code}-F${String(f).padStart(2, '0')}`,
      });
      const rows = [];
      for (let r = 1; r <= P.rows; r++) {
        const row = await api('POST', '/locations', {
          name: `ردیف ${r}`,
          typeId: typeRow.id,
          parentId: floor.id,
          warehouseId: w.id,
          code: `${w.code}-F${String(f).padStart(2, '0')}-R${String(r).padStart(2, '0')}`,
        });
        rows.push(row);
        for (let b = 1; b <= P.bins; b++) {
          await api('POST', '/locations', {
            name: `قفسه ${b}`,
            typeId: typeBin.id,
            parentId: row.id,
            warehouseId: w.id,
            code: `${w.code}-F${String(f).padStart(2, '0')}-R${String(r).padStart(2, '0')}-B${String(b).padStart(2, '0')}`,
          });
          locCount++;
        }
      }
      w.floors.push({ floor, rows });
    }
    step(`${w.code}: ${P.floors} طبقه`);
  }
  ok(`${locCount} قفسه در ${warehouses.length} انبار ساخته شد`);

  /* ---------------------------------------------------------- 3) کالاها */
  say(`کالاها (${P.products} قلم یدکی)`);
  const catalog = buildCatalog(P.products);
  const products = [];
  for (const p of catalog) {
    const created = await api('POST', '/products', {
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      salePrice: p.salePrice,
      wholesalePrice: p.wholesalePrice,
      managerPrice: p.managerPrice,
      minStock: p.minStock,
    });
    products.push({ ...created, family: p.family, price: p.salePrice, purchase: p.purchasePrice });
    if (products.length % 25 === 0) step(`${products.length}/${catalog.length} کالا`);
  }
  ok(`${products.length} کالا`);

  /* -------------------------------------------------------- 4) موجودی اولیه */
  say('موجودی اولیه در قفسه‌ها');
  // هر انبار یک سهم از کالاها را دارد تا انتقالِ بین انبارها معنا داشته باشد.
  const binLocations = [];
  for (const w of warehouses) {
    const bins = [];
    for (const f of w.floors) for (const r of f.rows) bins.push(r);
    binLocations.push({ w, binIds: null, _floors: w.floors });
    void bins;
  }
  // قفسه‌ها را دوباره از API نمی‌خوانیم؛ هنگامِ ساخت نگه می‌داشتیم بهتر بود،
  // ولی برای سادگی همان درخت را یک بار می‌خوانیم.
  const productBins = new Map(); // productId -> [{locationId, warehouseId}]
  for (let wi = 0; wi < warehouses.length; wi++) {
    const w = warehouses[wi];
    const tree = await api('GET', `/locations?warehouseId=${w.id}`);
    const leaves = (Array.isArray(tree) ? tree : tree.data ?? []).filter((l) => l.parentId && !l.hasChildren);
    const leafIds = (leaves.length ? leaves : (Array.isArray(tree) ? tree : tree.data ?? [])).map((l) => l.id);
    w.leafIds = leafIds;
  }

  let stocked = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    // ۷۰٪ کالاها در انبار مرکزی، ۳۰٪ در یک انبار دیگر هم موجودی دارند.
    const homes = [warehouses[0]];
    if (rnd() < 0.3 && warehouses.length > 1) homes.push(warehouses[int(1, warehouses.length - 1)]);
    for (const w of homes) {
      const bins = w.leafIds;
      if (!bins.length) continue;
      const loc = bins[int(0, bins.length - 1)];
      const qty = int(6, 90);
      await api('POST', '/inventory', { productId: p.id, locationId: loc, quantity: qty, note: 'موجودی اولیه دمو' });
      stocked++;
      if (!productBins.has(p.id)) productBins.set(p.id, []);
      productBins.get(p.id).push({ locationId: loc, warehouseId: w.id });
    }
    if (i % 25 === 0) step(`${i}/${products.length} کالا موجود شد`);
  }
  ok(`${stocked} ردیف موجودی`);

  /* ---------------------------------------------------------- 5) مشتری‌ها */
  say(`مشتری‌ها (${P.customers})`);
  const customers = [];
  for (let i = 0; i < P.customers; i++) {
    const isShop = rnd() < 0.45;
    const c = await api('POST', '/sales/customers', {
      firstName: isShop ? pick(CITIES) : personName(),
      lastName: isShop ? shopName() : '',
      address: `${pick(CITIES)} — خیابان ${int(1, 90)}`,
      creditDays: pick([0, 0, 10, 10, 20, 30]),
      creditLimit: pick([0, 0, 20_000_000, 50_000_000, 100_000_000]),
      phones: [{ phone: phone(), isPrimary: true }],
    });
    customers.push(c);
    if (i % 10 === 0) step(`${i}/${P.customers} مشتری`);
  }
  ok(`${customers.length} مشتری`);

  /* ------------------------------------------------------- 6) فاکتورها */
  say(`فاکتورها (${P.invoices})`);
  const invoiceIds = [];
  const invoicesMeta = [];
  let failures = 0;

  for (let i = 0; i < P.invoices; i++) {
    const w = warehouses[int(0, warehouses.length - 1)];
    const isWalkIn = rnd() < 0.15;
    const customer = isWalkIn ? null : customers[int(0, customers.length - 1)];
    const lineCount = int(1, 6);
    const lines = [];
    const used = new Set();
    for (let l = 0; l < lineCount; l++) {
      const p = products[int(0, products.length - 1)];
      if (used.has(p.id)) continue;
      used.add(p.id);
      const homes = productBins.get(p.id) ?? [];
      const home = homes.find((h) => h.warehouseId === w.id) ?? homes[0];
      if (!home) continue;
      const qty = int(1, 12);
      const discount = rnd() < 0.15 ? roundTo(p.price * qty * 0.05, 1000) : 0;
      lines.push({
        productId: p.id,
        locationId: home.locationId,
        quantity: qty,
        unitPrice: p.price,
        discount,
      });
    }
    if (!lines.length) {
      failures++;
      continue;
    }
    const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice - (l.discount ?? 0), 0);

    // الگوی پرداخت: نقد / کارت / ترکیبی / نسیه / چک
    const roll = rnd();
    const payments = [];
    let dueDate;
    if (!customer && roll < 0.7) {
      payments.push({ method: 'CASH', amount: total });
    } else if (roll < 0.2) {
      payments.push({ method: 'CASH', amount: total });
    } else if (roll < 0.4) {
      payments.push({ method: 'CARD', amount: total });
    } else if (roll < 0.55) {
      const cash = roundTo(total * 0.45, 10_000);
      payments.push({ method: 'CASH', amount: Math.min(cash, total) });
      payments.push({ method: 'CARD', amount: total - Math.min(cash, total) });
    } else if (roll < 0.7 && customer) {
      const cash = roundTo(total * 0.4, 10_000);
      payments.push({ method: 'CASH', amount: Math.min(cash, total) });
      payments.push({ method: 'CREDIT', amount: total - Math.min(cash, total) });
      dueDate = new Date(Date.now() + pick([10, 10, 20, 30]) * 86400000).toISOString();
    } else if (roll < 0.85 && customer) {
      payments.push({ method: 'CREDIT', amount: total });
      dueDate = new Date(Date.now() + pick([10, 20, 30]) * 86400000).toISOString();
    } else if (customer) {
      const chequeAmount = total;
      payments.push({
        method: 'CHEQUE',
        amount: chequeAmount,
        cheque: {
          number: String(int(100000, 999999)),
          bankName: pick(['ملت', 'صادرات', 'تجارت', 'پاسارگاد', 'سامان', 'ملی']),
          dueDate: new Date(Date.now() + pick([30, 45, 60]) * 86400000).toISOString(),
          holderName: customer.fullName ?? customer.firstName,
        },
      });
    } else {
      payments.push({ method: 'CASH', amount: total });
    }

    try {
      const inv = await api('POST', '/sales/invoices', {
        idempotencyKey: `DEMO-INV-${i + 1}-${seed}`,
        warehouseId: w.id,
        ...(customer ? { customerId: customer.id } : {}),
        ...(dueDate ? { dueDate } : {}),
        lines,
        payments,
      });
      invoiceIds.push(inv.id);
      invoicesMeta.push({ id: inv.id, number: inv.number, total });
    } catch (e) {
      failures++;
      if (failures < 6) warn(`فاکتور ${i + 1} رد شد: ${String(e.body?.message ?? e.message).slice(0, 120)}`);
    }
    if (i % 20 === 0) step(`${i}/${P.invoices} فاکتور`);
  }
  ok(`${invoiceIds.length} فاکتور ثبت شد${failures ? ` — ${failures} رد شد` : ''}`);

  /* --------------------------------------------------- 7) پیش‌فاکتورها */
  say(`پیش‌فاکتورها (${P.quotations})`);
  let quotations = 0;
  for (let i = 0; i < P.quotations; i++) {
    const w = warehouses[int(0, warehouses.length - 1)];
    const customer = rnd() < 0.7 ? customers[int(0, customers.length - 1)] : null;
    const lines = [];
    const used = new Set();
    for (let l = 0; l < int(1, 4); l++) {
      const p = products[int(0, products.length - 1)];
      if (used.has(p.id)) continue;
      used.add(p.id);
      lines.push({ productId: p.id, quantity: int(1, 8), unitPrice: p.price });
    }
    if (!lines.length) continue;
    try {
      await api('POST', '/sales/quotations', {
        warehouseId: w.id,
        ...(customer ? { customerId: customer.id } : {}),
        lines,
        validForMinutes: pick([1440, 4320, 10080]),
        note: rnd() < 0.3 ? 'قیمت تا پایان هفته معتبر است' : undefined,
      });
      quotations++;
    } catch (e) {
      if (quotations === 0) warn(`پیش‌فاکتور رد شد: ${String(e.body?.message ?? e.message).slice(0, 140)}`);
    }
    if (i % 10 === 0) step(`${i}/${P.quotations} پیش‌فاکتور`);
  }
  ok(`${quotations} پیش‌فاکتور`);

  /* --------------------------------------------------------- 8) مرجوعی */
  say(`مرجوعی (${P.returns})`);
  const returnIds = [];
  for (const inv of invoicesMeta.slice(-P.returns * 3)) {
    if (returnIds.length >= P.returns) break;
    try {
      const data = await api('GET', `/sales/invoices/${inv.id}/returnable`);
      const line = (data.lines ?? []).find((l) => l.returnable > 0);
      if (!line) continue;
      const qty = Math.min(line.returnable, int(1, 2));
      const r = await api('POST', '/sales/returns', {
        invoiceId: inv.id,
        idempotencyKey: `DEMO-RET-${inv.id}`,
        refundMethod: data.invoice?.customer ? 'CREDIT' : 'CASH',
        reason: 'مشتری گفت اندازه نمی‌خورد',
        lines: [{ saleLogId: line.saleLogId, quantity: qty, restock: true }],
      });
      returnIds.push(r.returnId ?? r.id);
    } catch (e) {
      warn(`مرجوعی روی فاکتور ${inv.number}: ${String(e.body?.message ?? e.message).slice(0, 90)}`);
    }
  }
  ok(`${returnIds.length} مرجوعی`);

  /* -------------------------------------------- 9) مانور انبارداری */
  say('مانور انبارداری (انتقال و تعدیل)');
  let transfers = 0;
  // یک بار خطا را نشان بده — وگرنه «۰ انتقال» در خلاصه هیچ سرنخی نمی‌دهد.
  let transferWarned = false;
  for (let i = 0; i < P.transfers * 3 && transfers < P.transfers; i++) {
    const p = products[int(0, products.length - 1)];
    const homes = productBins.get(p.id) ?? [];
    if (homes.length < 2) continue;

    /*
     * موجودیِ واقعیِ قفسه را قبل از انتقال بخوان. فاکتورهای دمو همان قفسه را
     * خالی کرده‌اند؛ بدون این خواندن، انتقال با INSUFFICIENT_STOCK رد می‌شد و
     * خلاصه «۶ انتقال از ۳۰» نشان می‌داد.
     */
    let source = null;
    for (const h of homes) {
      try {
        const stock = await api('GET', `/inventory/product/${p.id}/stock`);
        const row = (Array.isArray(stock) ? stock : stock.data ?? []).find(
          (r) => r.locationId === h.locationId,
        );
        if (row && Number(row.quantity ?? row.available ?? 0) >= 2) {
          source = h;
          break;
        }
      } catch {
        /* رد شو */
      }
    }
    if (!source) continue;
    const target = homes.find((h) => h.locationId !== source.locationId);
    if (!target) continue;

    try {
      await api('POST', '/inventory-transfer', {
        productId: p.id,
        fromLocationId: source.locationId,
        toLocationId: target.locationId,
        quantity: int(1, 3),
      });
      transfers++;
    } catch (e) {
      if (!transferWarned) {
        transferWarned = true;
        warn(`انتقال رد شد: ${String(e.body?.message ?? e.message).slice(0, 140)}`);
      }
    }
  }
  let adjustments = 0;
  for (let i = 0; i < P.adjustments; i++) {
    const w = warehouses[int(0, warehouses.length - 1)];
    const p = products[int(0, products.length - 1)];
    const loc = w.leafIds?.[int(0, (w.leafIds?.length ?? 1) - 1)];
    if (!loc) continue;
    try {
      await api('POST', '/inventory/adjust', {
        productId: p.id,
        locationId: loc,
        targetQuantity: int(0, 30),
        note: 'انبارگردانی نمونه',
      });
      adjustments++;
    } catch {
      /* رد شو */
    }
  }
  ok(`${transfers} انتقال · ${adjustments} تعدیل موجودی`);

  /* ------------------------------------------------- 10) تاریخ‌ها */
  if (!SKIP_BACKDATE && PSQL && DATABASE_URL) {
    say(`پخش تاریخ‌ها در ${SPREAD_DAYS} روز`);
    const file = join(here, 'backdate.sql');

    /*
     * همه‌ی پخشِ تاریخ در یک اسکریپتِ SQL.
     *
     * نسخهٔ اول از JS برای هر فاکتور UPDATE می‌ساخت؛ ولی چون psql آدرسِ
     * Prisma را با پارامترِ `?schema=public` قبول نمی‌کند (`invalid URI query
     * parameter`)، همه‌اش رد می‌شد و مغازه‌ی نمایشی تمامِ فروشش را «امروز»
     * نشان می‌داد. حالا: یک‌جا، بدونِ id، و مستقل از این‌که چند فاکتور ساخته شد.
     */
    const sql = `
\\set ON_ERROR_STOP off

-- چه چیزهایی امروز (همین اجرا) ساخته شده‌اند؟
CREATE TEMP TABLE demo_inv AS
  SELECT id FROM "SaleInvoice" WHERE "createdAt" >= CURRENT_DATE;
CREATE TEMP TABLE demo_q AS
  SELECT id FROM "Quotation" WHERE "createdAt" >= CURRENT_DATE;

-- خودِ فاکتورها: پخشِ تصادفی در ${SPREAD_DAYS} روز گذشته
UPDATE "SaleInvoice"
   SET "createdAt" = NOW() - (random() * ${SPREAD_DAYS}) * interval '1 day'
                        - (random() * 9) * interval '1 hour'
 WHERE id IN (SELECT id FROM demo_inv);

-- هر چیزی که به فاکتور آویزان است، همان تاریخِ فاکتور را می‌گیرد
UPDATE "InventoryLog" l SET "createdAt" = i."createdAt"
  FROM "SaleInvoice" i
 WHERE l."invoiceId" = i.id AND i.id IN (SELECT id FROM demo_inv);

UPDATE "CustomerLedger" c SET "createdAt" = i."createdAt"
  FROM "SaleInvoice" i
 WHERE c."invoiceId" = i.id AND i.id IN (SELECT id FROM demo_inv);

UPDATE "SaleReturn" r SET "createdAt" = i."createdAt" + interval '3 hours'
  FROM "SaleInvoice" i
 WHERE r."invoiceId" = i.id AND r."createdAt" >= CURRENT_DATE;

-- پیش‌فاکتورها
UPDATE "Quotation"
   SET "createdAt" = NOW() - (random() * ${SPREAD_DAYS}) * interval '1 day',
       "updatedAt" = NOW() - (random() * ${SPREAD_DAYS}) * interval '1 day'
 WHERE id IN (SELECT id FROM demo_q);
`;
    writeFileSync(file, sql, 'utf8');

    /*
     * آدرسِ Prisma را برای psql تمیز کن: `schema`، `connection_limit` و
     * `pool_timeout` پارامترهای خودِ Prisma هستند، نه libpq.
     */
    const url = (() => {
      try {
        const u = new URL(DATABASE_URL);
        for (const k of ['schema', 'connection_limit', 'pool_timeout', 'connect_timeout']) {
          u.searchParams.delete(k);
        }
        return u.toString();
      } catch {
        return DATABASE_URL;
      }
    })();

    const res = spawnSync(PSQL, [url, '-v', 'ON_ERROR_STOP=0', '-q', '-f', file], {
      encoding: 'utf8',
    });
    const sqlErr = (res.stderr || '').trim();
    if (res.status === 0 && !/ERROR/i.test(sqlErr)) {
      ok(`تاریخ ${invoicesMeta.length} فاکتور و ${quotations} پیش‌فاکتور پخش شد`);
    } else {
      warn(`پخش تاریخ نیمه‌کاره ماند: ${(sqlErr || `exit ${res.status}`).slice(0, 300)}`);
    }
  } else {
    say('پخش تاریخ‌ها (رد شد)');
    warn('psql یا DATABASE_URL در دسترس نبود — همه‌ی اسناد «امروز» می‌مانند');
  }

  /* -------------------------------------------------------------- خلاصه */
  const health2 = await api('GET', '/health');
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log('\n\u001b[32m=======================================================');
  console.log('  داده‌ی نمایشی آماده است');
  console.log('=======================================================\u001b[0m');
  console.log(`  انبار:      ${warehouses.length}`);
  console.log(`  قفسه:       ${locCount}`);
  console.log(`  کالا:       ${products.length}`);
  console.log(`  موجودی:     ${stocked}`);
  console.log(`  مشتری:      ${customers.length}`);
  console.log(`  فاکتور:     ${invoiceIds.length}`);
  console.log(`  پیش‌فاکتور: ${quotations}`);
  console.log(`  مرجوعی:     ${returnIds.length}`);
  console.log(`  کاربر:      ${users.length} (رمز demo1234)`);
  console.log(`  دیتابیس:    ${health2.db} · نسخه ${health2.version ?? '?'}`);
  console.log(`  زمان:       ${mins} دقیقه\n`);
}

main().catch((e) => {
  console.error('\n\u001b[31m XX  نشد:\u001b[0m');
  console.error(`   ${e.message}`);
  if (e.status === 401) {
    console.error('   رمزِ مدیر اشتباه است. رمز را در config\\.env (ADMIN_INITIAL_PASSWORD) ببینید');
    console.error('   یا با --password=... بدهید.');
  }
  process.exit(1);
});
