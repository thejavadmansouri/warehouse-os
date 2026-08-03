/**
 * استخراج برند / خودرو / دسته‌بندی از نامِ کالا.
 *
 * ستون جدا برای برند و خودرو در خروجی حسابداری وجود ندارد؛ این اطلاعات داخل
 * نام کالا هستند («دسته موتور زیر باطری 206 و سمند ملی عظام» → خودرو=پژو 206 +
 * سمند، برند=عظام، دسته=موتور). این اسکریپت آن‌ها را با دیکشنری استخراج می‌کند.
 *
 * قواعد:
 *  - برند تقریباً همیشه آخرین توکنِ نام است (تحلیل فراوانی روی ۳۳٬۵۲۶ نام).
 *    فقط برندهای دیکشنری پذیرفته می‌شوند؛ حدس آزاد نداریم.
 *  - خودرو با نام مستعار تشخیص داده می‌شود (405، ال90، الل90، تندرال90 ...).
 *    یک کالا می‌تواند چند خودرو داشته باشد؛ فعلاً اولی (رابطه‌ی schema تک‌مقداره است).
 *  - دسته‌بندی از کلیدواژه‌ی سرِ نام (لنت/دیسک → ترمز، بوش/طبق/سیبک → جلوبندی ...).
 *  - هر تشخیص یک confidence دارد تا کیفیت قابل سنجش باشد.
 *
 * این اسکریپت به‌صورت پیش‌فرض فقط گزارش می‌دهد و چیزی نمی‌نویسد.
 *   npx ts-node prisma/extract-attributes.ts --limit 100
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* ────────────────────────── دیکشنری برند ────────────────────────── */
/** alias → نام کانونی برند. چندکلمه‌ای‌ها اول بررسی می‌شوند (طولانی‌ترین اول). */
const BRAND_ALIASES: Record<string, string> = {};
const addBrand = (canonical: string, ...aliases: string[]) => {
  BRAND_ALIASES[canonical] = canonical;
  for (const a of aliases) BRAND_ALIASES[a] = canonical;
};

// چندکلمه‌ای
addBrand('آرین خودرو', 'اریان خودرو', 'ارین خودرو');
addBrand('جهان پارت');
addBrand('نوین پارت');
addBrand('آذین پارت', 'اذین پارت');
addBrand('جم پارت');
addBrand('جمع ساز', 'جمع‌ساز');
addBrand('فن آوران', 'فن اوران');
addBrand('خورشید موتور', 'خورشیدموتور');
addBrand('همراه یاران');
addBrand('تهران فام');
addBrand('دینا پارت', 'دیناپارت', 'دینا‌پارت');
addBrand('همگام خودرو');
addBrand('فابریک پارت');
addBrand('مژده وصل');
addBrand('ایمن تک', 'ایمن‌تک');
addBrand('سام پارت');
addBrand('ایران کاربراتور');
addBrand('اتحاد موتور', 'اتحادموتور');
addBrand('سازه گستر');
addBrand('پارت سازان');
addBrand('تکلان توس');
addBrand('نیکو پخش', 'نیکوپخش');
addBrand('سرو صنعت', 'سروصنعت');
addBrand('آسیا صنعت', 'اسیاصنعت');
addBrand('ایلیا صنعت', 'ایلیاصنعت');
addBrand('مدد سازان کوشان', 'مددسازان کوشان');
addBrand('کوشان پیروز', 'کوشان پیروز');
addBrand('بهینه کوشان');
addBrand('حاکم پارت');
addBrand('دنگل پارت');
addBrand('ایران دقیق');
addBrand('نی سی', 'نی‌سی');
addBrand('پی کو', 'پیکو');
addBrand('کا پی');
addBrand('سی پارت');
addBrand('آرال تک', 'ارال تک');
addBrand('گلپا موتور', 'گلپاموتور');
addBrand('الکا موتور', 'الکاموتور');
addBrand('ایران خودرو', 'ایرانخودرو');
addBrand('سایپا یدک');
addBrand('آب بان', 'اب بان');
addBrand('D.N.CO', 'dnco');
addBrand('JLCO', 'jlco');
addBrand('HIT');

// تک‌کلمه‌ای (از تحلیل فراوانی؛ همه ≥۴۰ تکرار)
for (const b of [
  'ایساکو', 'عظام', 'انکو', 'سایپا', 'شرکتی', 'ارپیکو', 'گیلان', 'کروز',
  'الما', 'پاسارگاد', 'کاوج', 'چکاد', 'رادیکال', 'پاسیکو', 'مجد', 'دیاکو',
  'برنز', 'پیشرفت', 'اماتا', 'مدرن', 'تیپیکو', 'مادپارت', 'ارادپارت',
  'کاپلان', 'الکا', 'امیرنیا', 'اخوت', 'هانتر', 'کوشان', 'یاران', 'لاهیجان',
  'سانکس', 'الدورا', 'مهرکو', 'سامفر', 'کوارت', 'همگام', 'فرانکو', 'ویژن',
  'مهرساز', 'پیروز', 'میبا', 'سهند', 'پولاسا', 'ایزل', 'سوگند', 'گلدن',
  'کوشش', 'سورنا', 'سلپیک', 'سپاهان', 'فرانتک', 'شبیر', 'سرو', 'دیلمون',
  'اسپیکال', 'مارموت', 'اپکو', 'کلاو', 'تیناکو', 'الپا', 'نیکان', 'دوستان',
  'اوران', 'متفرقه', 'ایرانی', 'اورجینال', 'اصلی', 'دانوب', 'معیار', 'ایسر',
  'سپهر', 'صاکو', 'بوش', 'تکستار', 'والئو', 'لوک', 'ساکس', 'مان', 'فرام',
  'دنسو', 'کویو', 'ماهله', 'گیتس', 'دایکو', 'پیربرگ', 'کنپارس', 'موتورژن',
  'GISP', 'HIC', 'AMATA', 'TGT', 'TPCO', 'SNT', 'GRC', 'TLG', 'AMG', 'HPC',
  'BPCO', 'SKP', 'APCO', 'NGK', 'RPM', 'PRX', 'IBBC', 'K27', 'VDO',
  // موج دوم: از تحلیل کل ۳۳٬۵۲۶ نام (توکن پایانیِ ناشناخته، همه ≥۱۶ تکرار)
  'ایرانمنش', 'اکیوم', 'اژیراک', 'رادمان', 'فنام', 'بالتین', 'کاسپین',
  'مهساموتور', 'پلاستکس', 'ونسونگ', 'کوشاوران', 'کوشاور', 'برازش', 'ایلکن',
  'والافن', 'رایکالتون', 'نورگستر', 'اتوکارن', 'پروا', 'شیفتن', 'دناکو',
  'نورسازان', 'ایندامین', 'بنیامین', 'پنتیکس', 'کبسون', 'سینافن', 'منوری',
  'تکنوکار', 'نصیر', 'نصیری', 'اسپید', 'ایفا', 'تاسوکی', 'ماهان', 'صنعتگر',
  'کوروش', 'استارتک', 'کارماتک', 'مشهدواشر', 'هرینگتون', 'فولادشید', 'سپنتا',
  'ریمارک', 'فدرال', 'کازین', 'ایتوک', 'سیناپس', 'اکمی', 'سامر', 'کاریبو',
  'عماد', 'افرا', 'پادما', 'ویوات', 'عبدلی', 'سورناموتور', 'اراد', 'قائم',
  'شایان', 'ابری', 'فولادی', 'سیلور', 'گلد', 'بست', 'پیک', 'مگ', 'اکیوم',
  'WERSI', 'SMS', 'HMC', 'TK', 'AGU', 'RSP', 'MCS', 'AMT', 'LKS', 'BIG',
  'GSR', 'FGP', 'PSA', 'FRT', 'ROD', 'GSK', 'MSC', 'MBP', 'GMB', 'ELMA',
  'ELMA7', 'MSD', 'hamtek', 'HAMTEK',
]) addBrand(b);

/**
 * دنباله‌های پرتکرارِ نام برند. اگر آخرین توکن یکی از این‌ها باشد و خودش برندِ
 * مستقلی نباشد، دو توکن آخر با هم برند است («... پارس نیکان»، «... فن آوران»).
 * بدون این قاعده، دُمِ بلندِ برندهای دوکلمه‌ای (۱۷۴ مورد فقط با «پارت») از دست می‌رود.
 */
const BRAND_SUFFIXES = new Set([
  'پارت', 'کو', 'صنعت', 'موتور', 'خودرو', 'تک', 'ساز', 'سازان', 'قطعه',
  'قطعات', 'فن', 'یدک', 'گستر', 'پخش', 'صنعتی', 'ایران', 'تنه', 'اراک',
]);

/** واژه‌های توصیفی که هرگز برند نیستند (وگرنه «... جدید» برند می‌شود). */
const NOT_BRAND = new Set([
  'راست', 'چپ', 'جلو', 'عقب', 'بالا', 'پایین', 'جدید', 'قدیم', 'مشکی',
  'سفید', 'ابی', 'آبی', 'بزرگ', 'کوچک', 'استوک', 'خام', 'کامل', 'دار',
  'لنت', 'لوازم', 'کارتن', 'فلزی', 'کاربراتوری', 'انژکتوری', 'ژاپن',
  'یورو4', 'ملی', 'مشهد', 'ساوه', 'دنده', 'سری', 'ست',
]);

const BRAND_KEYS = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);

/* ────────────────────────── دیکشنری خودرو ────────────────────────── */
/** نام کانونی خانواده → alias ها. عدد تنها (405/206) هم alias معتبر است. */
export const VEHICLES: Array<[string, string[]]> = [
  ['پراید', ['پراید', 'صبا', 'نسیم', '111', '131', '132', '141', '151']],
  ['تیبا', ['تیبا']],
  ['ساینا', ['ساینا']],
  ['کوییک', ['کوییک', 'کویيک']],
  ['شاهین', ['شاهین']],
  ['پژو 405', ['405']],
  ['پژو 206', ['206']],
  ['پژو 207', ['207']],
  ['پژو پارس', ['پارس']],
  ['سمند', ['سمند', 'ملی']],
  ['دنا', ['دنا']],
  ['سورن', ['سورن']],
  ['رانا', ['رانا']],
  ['تارا', ['تارا']],
  ['تندر 90', ['تندر', 'ال90', 'الل90', 'تندرال90', 'ال 90', 'l90', 'تندر ال90']],
  ['ساندرو', ['ساندرو']],
  ['پیکان', ['پیکان', 'پکان']],
  ['آریسان', ['اریسان', 'آریسان']],
  ['زامیاد', ['زامیاد']],
  ['کارا', ['کارا']],
  ['پادرا', ['پادرا']],
  ['ریو', ['ریو']],
  ['زانتیا', ['زانتیا']],
  ['مگان', ['مگان']],
  ['نیسان', ['نیسان']],
  ['مزدا', ['مزدا']],
  ['هایما', ['هایما']],
  ['جک', ['جک']],
  ['ام وی ام', ['ام وی ام', 'MVM']],
  ['برلیانس', ['برلیانس']],
  ['چری', ['چری']],
];

/* ────────────────────────── دسته‌بندی ────────────────────────── */
/** کلیدواژه → دسته. اولین کلیدواژه‌ای که در نام دیده شود برنده است. */
const CATEGORY_RULES: Array<[string, string[]]> = [
  ['ترمز', ['لنت', 'دیسک ترمز', 'کاسه چرخ', 'پمپ ترمز', 'بوستر', 'کالیپر', 'سیلندر چرخ', 'ترمز']],
  ['جلوبندی و تعلیق', ['بوش', 'طبق', 'سیبک', 'کمک فنر', 'فنر لول', 'میل موجگیر', 'موج گیر', 'موجگیر', 'ژامبون', 'توپی چرخ', 'اکسل', 'قرقری', 'میل تعادل', 'دسته موتور', 'کله قندی']],
  ['فرمان', ['جعبه فرمان', 'قاب فرمان', 'میل فرمان', 'هیدرولیک فرمان', 'فرمان']],
  ['موتور', ['سرسیلندر', 'میل لنگ', 'میللنگ', 'میلنگ', 'سوپاپ', 'پیستون', 'رینگ', 'یاتاقان', 'واشر', 'اویل', 'تسمه تایم', 'تایم', 'سرمیللنگ', 'پولی', 'کارتر', 'شاتون']],
  ['برق خودرو', ['دینام', 'استارت', 'وایر', 'شمع', 'کوئل', 'سنسور', 'فشنگی', 'دسته سیم', 'سوکت', 'مقاومت', 'چراغ', 'راهنما', 'باطری', 'استوپر', 'کیلومتر', 'اتومات']],
  ['سوخت رسانی', ['پمپ بنزین', 'انژکتور', 'کاربراتور', 'باک', 'سوخت', 'گازسوز', 'دوگانه']],
  ['خنک کاری', ['رادیاتور', 'ترموستات', 'واتر پمپ', 'واترپمپ', 'شیلنگ بخاری', 'فن', 'حباب گیر']],
  ['کولر و تهویه', ['کولر', 'کمپرسور', 'بخاری']],
  ['گیربکس و انتقال قدرت', ['گیربکس', 'کلاچ', 'پلوس', 'دنده', 'لیور', 'دیفرانسیل', 'مغزی دنده']],
  ['بدنه', ['شیشه بالابر', 'درب', 'قفل', 'گلگیر', 'سپر', 'زه', 'ابگیر', 'آبگیر', 'دیاق', 'رکاب', 'کاپوت', 'پوسته']],
  ['تزئینات', ['قاب', 'داشبورد', 'روکش', 'آرم', 'ارم', 'زیرپایی', 'ضبط']],
  ['مصرفی', ['فیلتر', 'روغن', 'گریس', 'شیشه شور', 'مایع']],
  ['ابزار', ['اچار', 'آچار', 'جک', 'ابزار']],
  // موج دوم: از تحلیل سرواژه‌های بدون دسته در کل کاتالوگ
  ['یراق و اتصالات', ['پیچ', 'مهره', 'خار', 'بست', 'اورینگ', 'پولک', 'واشر', 'شیم', 'لولا', 'ریل', 'گیره', 'قفلی']],
  ['شیلنگ و لوله', ['شیلنگ', 'لوله', 'خرطومی', 'اتصال']],
  ['بلبرینگ و ساچمه', ['بلبرینگ', 'ساچمه', 'رولبرینگ']],
  ['برق خودرو', ['خطر', 'لامپ', 'کلید', 'رله', 'فیوز', 'کویل', 'بوق', 'فندک', 'مه شکن', 'مه', 'دزدگیر', 'انتن', 'آنتن']],
  ['بدنه', ['شیشه', 'گلگیر', 'سینی', 'دستگیره', 'ابرویی', 'فلاپ', 'شلگیر', 'لچکی', 'شاسی', 'جلوپنجره', 'نوار', 'لبه']],
  ['تزئینات', ['قالپاق', 'تودری', 'طاقچه', 'موکت', 'افتابگیر', 'آفتابگیر', 'طلق', 'اینه', 'آینه']],
  ['جلوبندی و تعلیق', ['کمک', 'سگدست', 'بازویی', 'گردگیر', 'هرزگرد', 'رام', 'غربیل', 'مچی', 'ریگلاژ', 'سیبک']],
  ['موتور', ['تسمه', 'مانیفولد', 'اسبک', 'استکان', 'کارتل', 'هواکش', 'دریچه', 'میل سوپاپ', 'واشرسرسیلندر', 'اویل پمپ']],
  ['گیربکس و انتقال قدرت', ['سرپلوس', 'مغزی', 'محک', 'کیت کلاچ', 'دوشاخ']],
  ['سوخت رسانی', ['منبع', 'صافی', 'کنیستر', 'مخزن', 'پمپ']],
  ['مصرفی', ['چسب', 'عایق', 'لاستیک', 'تیغه برف پاک کن', 'تیغه']],
  ['ایمنی', ['کمربند', 'ضربه گیر', 'ایربگ']],
];

/* ────────────────────────── استخراج ────────────────────────── */
type Result = {
  sku: string;
  name: string;
  brand: string | null;
  brandConf: 'high' | 'low' | null;
  vehicles: string[];
  category: string | null;
};

/** توکن‌سازی: «/» هم جداکننده است («405/اریان خودرو»). */
function tokenize(name: string): string[] {
  return name
    .replace(/[\/(),]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * دنباله‌ی کدِ قطعه را از انتها حذف می‌کند («... ایساکو 0301400599»، «... دانوب کد 1100»)
 * تا برند واقعاً در انتهای نام قرار بگیرد.
 */
function stripTrailingCode(tokens: string[]): string[] {
  const out = [...tokens];
  while (out.length > 1) {
    const last = out[out.length - 1];
    if (/^\d{3,}$/.test(last) || /^[A-Za-z]{2,}\d{2,}$/.test(last)) {
      out.pop();
      if (out.length > 1 && out[out.length - 1] === 'کد') out.pop();
      continue;
    }
    break;
  }
  return out;
}

function detectBrand(name: string): { brand: string | null; conf: 'high' | 'low' | null } {
  const tokens = stripTrailingCode(tokenize(name));
  const padded = ' ' + tokens.join(' ').toLowerCase() + ' ';

  // ۱) برندِ چندکلمه‌ای یا تک‌کلمه‌ایِ دیکشنری، در انتهای نام → اطمینان بالا
  for (const key of BRAND_KEYS) {
    const k = key.toLowerCase();
    if (padded.endsWith(' ' + k + ' ')) return { brand: BRAND_ALIASES[key], conf: 'high' };
  }
  // ۲) همان برند ولی وسط نام (مثلاً بعدش «کد 1102») → اطمینان پایین
  for (const key of BRAND_KEYS) {
    const k = key.toLowerCase();
    if (padded.includes(' ' + k + ' ')) return { brand: BRAND_ALIASES[key], conf: 'low' };
  }
  // ۳) برندِ دوکلمه‌ایِ خارج از دیکشنری: «... X پارت» / «... X کو» / «... X صنعت»
  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];
  if (
    last &&
    prev &&
    BRAND_SUFFIXES.has(last) &&
    !NOT_BRAND.has(prev) &&
    !isVehicleAlias(prev) &&
    !/^\d+$/.test(prev)
  ) {
    // اطمینان «پایین» چون دیکشنری تأییدش نکرده — برای بازبینی دستی علامت می‌خورد
    return { brand: `${prev} ${last}`, conf: 'low' };
  }

  return { brand: null, conf: null };
}

const VEHICLE_ALIASES = new Set(
  VEHICLES.flatMap(([, aliases]) => aliases.map((a) => a.toLowerCase())),
);

function isVehicleAlias(token: string): boolean {
  return VEHICLE_ALIASES.has(token.toLowerCase());
}

function detectVehicles(name: string): string[] {
  const tokens = tokenize(name).map((t) => t.toLowerCase());
  const joined = ' ' + tokens.join(' ') + ' ';
  const found: string[] = [];
  for (const [canonical, aliases] of VEHICLES) {
    for (const a of aliases) {
      const al = a.toLowerCase();
      const hit = al.includes(' ')
        ? joined.includes(' ' + al + ' ')
        : tokens.includes(al);
      if (hit) {
        if (!found.includes(canonical)) found.push(canonical);
        break;
      }
    }
  }
  // «ملی» تنها وقتی سمند است که سمند/EF7 در نام باشد یا خودروی دیگری نباشد
  return found;
}

/**
 * طولانی‌ترین کلیدواژه‌ی منطبق برنده است (نه اولین)، وگرنه «درب» در
 * «پوسته درب داشبورد» بر «داشبورد» غلبه می‌کند و «فن» بر «پلوس».
 * تطبیق فقط روی مرزِ کلمه است تا «فن» داخل «فنر» نیفتد.
 */
function detectCategory(name: string): string | null {
  const n = ' ' + tokenize(name).join(' ') + ' ';
  let best: { cat: string; len: number } | null = null;
  for (const [cat, keys] of CATEGORY_RULES) {
    for (const k of keys) {
      if (n.includes(' ' + k + ' ') && (!best || k.length > best.len)) {
        best = { cat, len: k.length };
      }
    }
  }
  return best?.cat ?? null;
}

function analyze(sku: string, name: string): Result {
  const { brand, conf } = detectBrand(name);
  return {
    sku,
    name,
    brand,
    brandConf: conf,
    vehicles: detectVehicles(name),
    category: detectCategory(name),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : 100;

  const all = args.includes('--all');
  const offIdx = args.indexOf('--offset');
  const skip = offIdx >= 0 ? Number(args[offIdx + 1]) : 0;
  const products = await prisma.product.findMany({
    ...(all ? {} : { take: limit, skip }),
    orderBy: { sku: 'asc' },
    select: { sku: true, name: true },
  });

  const results = products.map((p) => analyze(p.sku, p.name));

  // در حالت --all فقط آمار و پرتکرارترین برندهای ناشناخته را گزارش کن
  if (all) {
    const unknownTail: Record<string, number> = {};
    for (const r of results) {
      if (r.brand) continue;
      const t = stripTrailingCode(tokenize(r.name));
      const tail = t[t.length - 1];
      if (!tail || /^\d+$/.test(tail)) continue;
      unknownTail[tail] = (unknownTail[tail] || 0) + 1;
    }
    console.log('پرتکرارترین توکن‌های پایانیِ ناشناخته (کاندید برند):');
    console.log(
      Object.entries(unknownTail)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 150)
        .map(([k, v]) => `${k}:${v}`)
        .join(', '),
    );
    const unknownHead: Record<string, number> = {};
    for (const r of results) {
      if (r.category) continue;
      const head = tokenize(r.name)[0];
      if (head) unknownHead[head] = (unknownHead[head] || 0) + 1;
    }
    console.log('پرتکرارترین سرواژه‌های بدون دسته:');
    console.log(
      Object.entries(unknownHead)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([k, v]) => `${k}:${v}`)
        .join(', '),
    );
    console.log('─'.repeat(70));
  }

  for (const r of all ? [] : results) {
    const flag = r.brandConf === 'low' ? '?' : r.brand ? ' ' : '✗';
    console.log(
      `${flag} ${r.sku.padEnd(9)} ${r.name}\n` +
        `    برند=${r.brand ?? '—'}${r.brandConf === 'low' ? ' (کم‌اطمینان)' : ''}` +
        `  |  خودرو=${r.vehicles.join('، ') || '—'}` +
        `  |  دسته=${r.category ?? '—'}`,
    );
  }

  const n = results.length;
  const pct = (x: number) => `${x} (${Math.round((x / n) * 100)}%)`;
  console.log('─'.repeat(70));
  console.log(`نمونه: ${n} کالا`);
  console.log(`برند تشخیص داده شد:   ${pct(results.filter((r) => r.brand).length)}`);
  console.log(`  از این تعداد کم‌اطمینان: ${results.filter((r) => r.brandConf === 'low').length}`);
  console.log(`خودرو تشخیص داده شد: ${pct(results.filter((r) => r.vehicles.length).length)}`);
  console.log(`  چند-خودرویی:          ${results.filter((r) => r.vehicles.length > 1).length}`);
  console.log(`دسته تشخیص داده شد:  ${pct(results.filter((r) => r.category).length)}`);
  if (!args.includes('--commit')) {
    console.log('این فقط گزارش است؛ چیزی در دیتابیس نوشته نشد. برای نوشتن: --commit');
    await prisma.$disconnect();
    return;
  }

  await write(results);
  await prisma.$disconnect();
}

/* ────────────────────────── نوشتن در دیتابیس ────────────────────────── */

/** کدِ دسته از روی نام ساخته می‌شود (Category.code یکتا و اجباری است). */
const CATEGORY_CODES: Record<string, string> = {
  'ترمز': 'BRK',
  'جلوبندی و تعلیق': 'SUS',
  'فرمان': 'STR',
  'موتور': 'ENG',
  'برق خودرو': 'ELE',
  'سوخت رسانی': 'FUE',
  'خنک کاری': 'COO',
  'کولر و تهویه': 'AC',
  'گیربکس و انتقال قدرت': 'TRN',
  'بدنه': 'BDY',
  'تزئینات': 'TRM',
  'مصرفی': 'CON',
  'ابزار': 'TOO',
  'یراق و اتصالات': 'FST',
  'شیلنگ و لوله': 'HOS',
  'بلبرینگ و ساچمه': 'BRG',
  'ایمنی': 'SAF',
};

async function write(results: Result[]) {
  // ۱) برندها
  const brandNames = [...new Set(results.map((r) => r.brand).filter(Boolean))] as string[];
  for (const name of brandNames) {
    await prisma.brand.upsert({ where: { name }, update: {}, create: { name, aliases: [] } });
  }
  const brandId = new Map(
    (await prisma.brand.findMany({ select: { id: true, name: true } })).map((b) => [b.name, b.id]),
  );

  // ۲) دسته‌ها
  const catNames = [...new Set(results.map((r) => r.category).filter(Boolean))] as string[];
  for (const name of catNames) {
    const code = CATEGORY_CODES[name] ?? name.slice(0, 3).toUpperCase();
    await prisma.category.upsert({ where: { name }, update: {}, create: { name, code } });
  }
  const catId = new Map(
    (await prisma.category.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id]),
  );

  // ۳) خودروها در سطح «خانواده» (سال نامشخص → 0/0؛ UI موجود صفر را نمایش نمی‌دهد)
  const vehNames = [...new Set(results.flatMap((r) => r.vehicles))];
  for (const name of vehNames) {
    await prisma.vehicleModel.upsert({
      where: { name_startYear_endYear: { name, startYear: 0, endYear: 0 } },
      update: {},
      create: { name, startYear: 0, endYear: 0, aliases: [] },
    });
  }
  const vehId = new Map(
    (await prisma.vehicleModel.findMany({ where: { startYear: 0, endYear: 0 }, select: { id: true, name: true } }))
      .map((v) => [v.name, v.id]),
  );

  console.log(`برند: ${brandNames.length} | دسته: ${catNames.length} | خودرو: ${vehNames.length}`);

  // ۴) اتصال به کالاها
  const ids = new Map(
    (await prisma.product.findMany({ select: { id: true, sku: true } })).map((p) => [p.sku, p.id]),
  );

  let updated = 0;
  let links = 0;
  const CH = 500;
  for (let i = 0; i < results.length; i += CH) {
    const slice = results.slice(i, i + CH);
    const ops: any[] = [];
    for (const r of slice) {
      const pid = ids.get(r.sku);
      if (!pid) continue;
      const data: Record<string, string> = {};
      if (r.brand && brandId.has(r.brand)) data.brandId = brandId.get(r.brand)!;
      if (r.category && catId.has(r.category)) data.categoryId = catId.get(r.category)!;
      // خودروی اصلی = اولین تشخیص
      if (r.vehicles[0] && vehId.has(r.vehicles[0])) data.vehicleModelId = vehId.get(r.vehicles[0])!;
      if (Object.keys(data).length) {
        ops.push(prisma.product.update({ where: { id: pid }, data }));
        updated++;
      }
      for (const v of r.vehicles) {
        const vid = vehId.get(v);
        if (!vid) continue;
        ops.push(
          prisma.productVehicle.upsert({
            where: { productId_vehicleModelId: { productId: pid, vehicleModelId: vid } },
            update: {},
            create: { productId: pid, vehicleModelId: vid },
          }),
        );
        links++;
      }
    }
    await prisma.$transaction(ops);
    console.log(`  ... ${Math.min(i + CH, results.length)}/${results.length}`);
  }

  console.log('─'.repeat(70));
  console.log(`✓ ${updated} کالا به‌روزرسانی شد، ${links} پیوند کالا↔خودرو ثبت شد.`);
}

// فقط وقتی مستقیماً اجرا می‌شود؛ در حالت import (برای استفاده از VEHICLES)
// نباید کل استخراج اجرا شود.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
