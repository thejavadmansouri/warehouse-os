import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePersian } from '../engine/utils/persian-normalize';

/**
 * وزن‌های امتیازدهی — ترتیب اولویت:
 * 1) قطعه (Part)   2) مدل خودرو (Vehicle)   3) برند (Brand)   4) توضیحات/alias
 */
const WEIGHT = {
  PART_ID_MATCH: 100,
  PART_NAME_MATCH: 80,
  PART_ALIAS_MATCH: 70,
  // نام قطعهٔ گفته‌شده مستقیماً در نام خود محصول دیده شد — سیگنال تمایزدهندهٔ اصلی.
  // (قبلاً partName فقط با PartCatalog مقایسه می‌شد، نه با نام محصول → محصول درست
  // امتیاز قطعه نمی‌گرفت و فقط با خودرو رقابت می‌کرد.)
  PART_NAME_IN_PRODUCT: 45, // به‌ازای هر توکن، حداکثر ۳ توکن
  PART_TOKEN_FALLBACK: 25, // فقط وقتی هیچ partCatalogId شناسایی نشده

  VEHICLE_ID_MATCH: 70,
  VEHICLE_NAME_MATCH: 60,
  VEHICLE_ALIAS_MATCH: 55,

  BRAND_ID_MATCH: 25,
  BRAND_NAME_MATCH: 20,
  BRAND_ALIAS_MATCH: 20,

  DESCRIPTION_TOKEN_MATCH: 5,
};

const MAX_CANDIDATES = 100;
const MAX_SUGGESTIONS = 5;

// اینها روی confidence (نه score خام) اعمال می‌شوند
const MIN_MARGIN_OVER_SECOND = 15;

// حالت family-only («۴۰۵» بدون تیپ): سخت‌گیرانه‌تر، چون احتمال وجود چند تیپ
// از همان قطعه بیشتر است.
const MIN_MARGIN_FAMILY_ONLY = 25;

/**
 * تأیید خودکار فعلاً خاموش است.
 *
 * سنجش روی ۱۰۰ محصول واقعی (۶۰۰ جست‌وجو، اسکریپت در docs/voice-benchmark.md):
 * از ۷ موردی که خودکار تأیید شد، فقط ۵ مورد درست بود — دقت ۷۱٪. یکی از
 * غلط‌ها حتی با اطمینان ۱۰۰ ثبت شد:
 *
 *   گفته شد: «شیلنگ بالارادیات کوئیک ساینا S پولاسا»
 *   ثبت شد : «مجموعه شیلنگ هیدرولیک قوی تیباساینا کوئیک پولاسا»
 *
 * یک تپ اضافه چند ثانیه هزینه دارد؛ یک ثبت خودکارِ اشتباه موجودی را خراب
 * می‌کند و تا انبارگردانی بعدی کشف نمی‌شود — و در این فاصله فروش و گزارش
 * را هم غلط می‌کند. تا وقتی دقت به ۹۵٪+ نرسد، پرسیدن ارزان‌تر است.
 *
 * برای روشن کردن دوباره: این را true کن و سنجش را دوباره اجرا کن.
 */
const AUTO_CONFIRM_ENABLED = false;

const MIN_TOKEN_LENGTH = 2;

// چقدر confidence می‌تواند بر اساس فاصلهٔ امتیاز خام از بهترین کاندید افت کند.
// بزرگ‌تر = تفکیک تندتر بین گزینه‌ها.
const RELATIVE_CONFIDENCE_SPREAD = 45;

// وزن «چه نسبتی از نام محصول با گفتار توضیح داده شد». تفکیک‌کنندهٔ اصلی بین
// محصولاتی است که همان توکن‌ها را دارند ولی یکی کلمات اضافهٔ بیشتری دارد.
const NAME_COVERAGE_WEIGHT = 60;

// کلماتی که معنای قطعه/برند/خودرو ندارند و نباید در matching شرکت کنند
// (در حالت ایده‌آل پارسر باید اینها را به‌عنوان UNIT/NUMBER مصرف کند؛
// این لیست فقط یک لایهٔ دفاعی اضافه در matcher است)
const STOPWORDS = new Set([
  'تا', 'دونه', 'عدد', 'تومن', 'تومان', 'ریال',
  'لطفا', 'لطفاً', 'یه', 'یک', 'یکی', 'برای', 'از', 'به', 'در',
]);

// اگر بهترین کاندید confidence خیلی پایینی دارد (یعنی فقط از fallback
// ضعیف کلمات آمده)، اصلاً نباید به‌عنوان suggestion نمایش داده شود
const MIN_SUGGESTION_CONFIDENCE = 15;

// موقعیت/سمت — تفکیک‌کننده‌ی مهم SKU (لنت جلو ≠ لنت عقب، آینه چپ ≠ آینه راست)
const POSITION_WORDS = new Set(['جلو', 'عقب']);
const SIDE_WORDS = new Set(['چپ', 'راست']);
const ANTONYM: Record<string, string> = {
  جلو: 'عقب',
  عقب: 'جلو',
  چپ: 'راست',
  راست: 'چپ',
};
const POSITION_MATCH_SCORE = 20;
const POSITION_CONTRADICT_SCORE = -40;
const CONFIDENCE_POSITION_PENALTY = 40;

// نرمال‌سازی یکسان با موتور پارس؛ تا نام‌های دیتابیس و توکن‌های گفتار برابر مقایسه شوند
function norm(text?: string | null) {
  return normalizePersian(text);
}

interface MatchInput {
  partCatalogId?: string | null;
  partName?: string | null; // خروجی خام پارسر (parsed.productName)
  vehicleModelIds?: string[]; // همهٔ تریم‌های منطبق با نام خانوادهٔ خودرو
  vehicleName?: string | null; // parsed.vehicleFamily / vehicleVariant
  brandId?: string | null;
  brandName?: string | null; // parsed.brand
  keywordTokens?: string[];
  // true فقط وقتی کارگر مدل را صریح گفته («پراید 131»). اگر family-only باشد،
  // هرگز auto-confirm نمی‌کنیم — کارگر باید از بین محصولات سازگار انتخاب کند.
  modelIsExplicit?: boolean;
}

interface ScoredCandidate {
  product: any;
  score: number;
  confidence: number;
  reasons: string[];
  partMatched: boolean;
  vehicleMatched: boolean;
  brandMatched: boolean;
  disqualified: boolean;
}

@Injectable()
export class ProductMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async findVehicleModelIdsByName(name: string | null): Promise<string[]> {
    if (!name) return [];

    // هر ورودی خانواده (مثل «پژو 405» یا «ال 90») می‌تواند به چند تریم واقعی
    // (GLX، E2، ...) نگاشته شود. ابتدا مطابقت مستقیم، سپس گسترش به کل خانواده
    // بر اساس پیشوند نام — تا محصولی که به تریم «تندر 90 E2» وصل است وقتی کارگر
    // «ال 90» می‌گوید به‌اشتباه به‌عنوان «خودروی دیگر» رد نشود.
    const direct = await this.prisma.vehicleModel.findMany({
      where: {
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { aliases: { has: name } },
        ],
      },
      select: { id: true, name: true },
    });
    if (!direct.length) return [];

    const family = await this.prisma.vehicleModel.findMany({
      where: { OR: direct.map((v) => ({ name: { startsWith: v.name } })) },
      select: { id: true },
    });

    return Array.from(new Set([...direct.map((v) => v.id), ...family.map((v) => v.id)]));
  }

  async findBrandIdByName(name: string | null) {
    if (!name) return null;

    const brand = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { aliases: { has: name } },
        ],
      },
      select: { id: true },
    });

    return brand?.id ?? null;
  }

  // متد جدید — قبلاً اصلاً وجود نداشت، به همین دلیل قطعه هیچ نقشی در matching نداشت
  async findPartCatalogIdByName(name: string | null) {
    if (!name) return null;

    const part = await this.prisma.partCatalog.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { aliases: { has: name } },
        ],
      },
      select: { id: true },
    });

    return part?.id ?? null;
  }

  async match(input: MatchInput) {
    const tokens = (input.keywordTokens ?? [])
      .map((x: string) => norm(x))
      .filter((x: string) => x.length >= MIN_TOKEN_LENGTH)
      .filter((x: string) => !STOPWORDS.has(x));

    // متن جستجوی معنایی = واژه‌های محتوایی گفتار (قطعه + خودرو + برند + توکن‌ها).
    // این متن با trigram در Postgres رتبه‌بندی می‌شود تا کاندیدهای واقعاً مرتبط
    // برگردند — نه یک برش کور از ۱۰۰ ردیف اول.
    const queryText = norm(
      [input.partName, input.vehicleName, input.brandName, ...tokens]
        .filter((x): x is string => !!x && `${x}`.trim().length > 0)
        .join(' '),
    );

    const candidates = await this.fetchCandidates(
      input.partCatalogId ?? null,
      input.vehicleModelIds ?? [],
      input.brandId ?? null,
      queryText,
    );

    if (!candidates.length) {
      return { status: 'NONE', best: null, suggestions: [] };
    }

    const scoredAll = candidates
      .map((product) => this.scoreCandidate(product, input, tokens))
      // کاندیدهایی که صراحتاً با مدل خودروی ورودی تناقض دارند حذف می‌شوند
      // (نه فقط امتیاز کمتر — اصلاً وارد رقابت نمی‌شوند)
      .filter((c) => !c.disqualified);

    // confidence تا اینجا فقط از سه پرچم (قطعه/خودرو/برند) ساخته شده، پس همهٔ
    // تطبیق‌های خوب روی یک عدد (معمولاً ۸۵) جمع می‌شوند و فاصلهٔ اول و دوم صفر
    // می‌شود. نتیجه: شرط margin هرگز برقرار نمی‌شد و تأیید خودکار عملاً غیرممکن
    // بود — کارگر برای هر قلم مجبور به یک تپ اضافه می‌شد، حتی وقتی هیچ ابهامی
    // نبود.
    //
    // امتیاز خام (score) سیگنال ریز را دارد ولی دور ریخته می‌شد. اینجا آن را
    // نسبت به بهترین کاندید وارد confidence می‌کنیم: بهترین، عدد پرچمی خودش را
    // نگه می‌دارد و بقیه به نسبت فاصله‌شان پایین می‌آیند. معنی عدد بالا عوض
    // نمی‌شود، فقط رتبه‌بندی معنا پیدا می‌کند.
    this.applyRelativeConfidence(scoredAll);

    const ranked = scoredAll
      // کاندیدهایی که فقط با نویز (مثل توکن‌های بی‌معنی) امتیاز گرفته‌اند
      // را نباید به کاربر پیشنهاد داد — بهتر است هیچ پیشنهادی نداشته باشیم
      .filter((c) => c.confidence >= MIN_SUGGESTION_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence || b.score - a.score);

    if (!ranked.length) {
      return { status: 'NONE', best: null, suggestions: [] };
    }

    const best = ranked[0];
    const second = ranked[1];

    const hasVehicleInput = !!(input.vehicleModelIds?.length || input.vehicleName);
    const vehicleRequirementSatisfied = !hasVehicleInput ? true : best.vehicleMatched;

    // در گفتار واقعی کارگر «۴۰۵» می‌گوید، نه «پژو ۴۰۵ GLX» — پس modelIsExplicit
    // تقریباً هیچ‌وقت درست نیست. شرط کردنِ تأیید خودکار به آن یعنی هیچ‌وقت
    // خودکار تأیید نشود، حتی وقتی یک تطبیق دقیق و بی‌رقیب داریم.
    //
    // به‌جای رد کردنِ کاملِ حالت family-only، آستانه را سخت‌تر می‌کنیم: باید
    // برندهٔ روشنی وجود داشته باشد. اگر چند تیپ از همان قطعه باشند، امتیازشان
    // نزدیک می‌شود و همین فاصله جلوی حدس زدن را می‌گیرد — که همان چیزی است
    // که قانون قبلی می‌خواست تضمین کند.
    const requiredMargin = input.modelIsExplicit
      ? MIN_MARGIN_OVER_SECOND
      : MIN_MARGIN_FAMILY_ONLY;

    // آستانهٔ ثابت (۹۰) وقتی برند گفته نشده از نظر ریاضی دست‌نیافتنی است:
    // برند ۱۵ امتیاز از confidence را می‌سازد، پس سقف بدون برند ۸۵ است.
    // شرط ثابت یعنی «هیچ‌وقت خودکار تأیید نکن» — که همان حالت فعلی بود.
    //
    // به‌جای عدد ثابت، می‌سنجیم آیا این کاندید **هر چیزی را که کارگر واقعاً
    // گفته** تطبیق داده یا نه. اگر برند نگفته، نبودِ برند نباید جریمه شود؛
    // ابهامِ ناشی از آن با شرط margin گرفته می‌شود.
    const brandWasSpoken = !!(input.brandId || input.brandName);
    const maxAchievable =
      45 + (hasVehicleInput ? 40 : 15) + (brandWasSpoken ? 15 : 0);

    const canAutoConfirm =
      AUTO_CONFIRM_ENABLED &&
      best.partMatched &&
      vehicleRequirementSatisfied &&
      best.confidence >= maxAchievable &&
      (!second || best.confidence - second.confidence >= requiredMargin);

    if (canAutoConfirm) {
      return {
        status: 'AUTO',
        best,
        suggestions: ranked.slice(0, MAX_SUGGESTIONS),
      };
    }

    return {
      status: 'SUGGEST',
      best: null,
      suggestions: ranked.slice(0, MAX_SUGGESTIONS),
    };
  }

  /**
   * بازیابی کاندیدها در خود Postgres رتبه‌بندی می‌شود (trigram روی نام محصول) به‌جای
   * یک OR گسترده + برش کور `take(100)` که محصول درست را قبل از امتیازدهی حذف می‌کرد.
   * کاندیدها = بالاترین شباهتِ نامِ محصول به متن گفتار، به‌علاوهٔ همهٔ محصولاتِ منطبق
   * با سیگنال‌های ساخت‌یافته (partCatalog/خودرو/برند). سپس در JS (وزن‌های دامنه:
   * تناقض خودرو، جلو/عقب، سمت) دوباره امتیاز داده می‌شوند.
   * مقیاس: در ۱۰k ردیف seq-scanِ word_similarity سریع است؛ برای ۱۰۰k یک ایندکس
   * GiST + عملگر `<%` با set_limit اضافه می‌شود.
   */
  private async fetchCandidates(
    partCatalogId: string | null,
    vehicleModelIds: string[],
    brandId: string | null,
    queryText: string,
  ) {
    const hasQuery = queryText.trim().length > 0;
    if (!hasQuery && !partCatalogId && !vehicleModelIds.length && !brandId) {
      return [];
    }

    const params: unknown[] = [];
    const ors: string[] = [];
    let simExpr = '0';
    let tokenHitExpr = '0';

    if (hasQuery) {
      params.push(queryText); // $1 — reused in WHERE and ORDER BY
      // similarity (whole-string) — نه word_similarity: توکن‌های پرتکرار مثل «ال 90»
      // باعث اشباع word_similarity به ۱.۰ برای محصولات نامرتبط می‌شدند.
      simExpr = `similarity(name, $1)`;
      ors.push(`${simExpr} > 0.15`);

      // بازیابی توکنی (مستقل از ترتیب): محصولاتی که کلمات گفتار در نامشان هست هم
      // کاندید شوند — لازم است چون کاتالوگ واردشده رابطهٔ partCatalog/خودرو/برند ندارد
      // و اطلاعات قطعه/خودرو داخل خود «نام» است. بدون این، similarity کل‌رشته آنها را رد می‌کند.
      const words = queryText
        .split(/\s+/)
        .filter((w) => w.length >= MIN_TOKEN_LENGTH);
      const hitParts: string[] = [];
      for (const w of words) {
        params.push(`%${w}%`);
        const ph = `$${params.length}`;
        ors.push(`name ILIKE ${ph}`);
        hitParts.push(`(CASE WHEN name ILIKE ${ph} THEN 1 ELSE 0 END)`);
      }
      if (hitParts.length) tokenHitExpr = hitParts.join(' + ');
    }
    if (partCatalogId) {
      params.push(partCatalogId);
      ors.push(`"partCatalogId" = $${params.length}`);
    }
    if (brandId) {
      params.push(brandId);
      ors.push(`"brandId" = $${params.length}`);
    }
    if (vehicleModelIds.length) {
      const placeholders = vehicleModelIds.map((id) => {
        params.push(id);
        return `$${params.length}`;
      });
      ors.push(`"vehicleModelId" IN (${placeholders.join(', ')})`);
    }

    params.push(MAX_CANDIDATES);
    const limitPlaceholder = `$${params.length}`;

    // ترتیب برای برشِ LIMIT مهم است (نه رتبهٔ نهایی): بیشترین هم‌پوشانی توکن، بعد similarity.
    const sql =
      `SELECT id FROM "Product" ` +
      `WHERE "deletedAt" IS NULL AND "isActive" = true AND (${ors.join(' OR ')}) ` +
      `ORDER BY (${tokenHitExpr}) DESC, ${simExpr} DESC LIMIT ${limitPlaceholder}`;

    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(sql, ...params);
    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];

    // ترتیب نهایی مهم نیست؛ scoreCandidate دوباره رتبه‌بندی می‌کند.
    return this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { brand: true, vehicleModel: true, partCatalog: true },
    });
  }

  private scoreCandidate(
    product: any,
    input: MatchInput,
    tokens: string[],
  ): ScoredCandidate {
    const reasons: string[] = [];
    let score = 0;
    let disqualified = false;

    const name = norm(product.name);
    const desc = norm(product.description);

    const partName = norm(product.partCatalog?.name);
    const partAliases: string[] = product.partCatalog?.aliases ?? [];

    const vehicleName = norm(product.vehicleModel?.name);
    const vehicleAliases: string[] = product.vehicleModel?.aliases ?? [];

    const brandName = norm(product.brand?.name);
    const brandAliases: string[] = product.brand?.aliases ?? [];

    // ---------- 1) قطعه — بالاترین اولویت ----------
    let partMatched = false;

    if (input.partCatalogId && product.partCatalogId === input.partCatalogId) {
      score += WEIGHT.PART_ID_MATCH;
      partMatched = true;
      reasons.push(`part matched: ${product.partCatalog?.name ?? ''}`);
    } else if (input.partName) {
      const pn = norm(input.partName);

      if (partName && (partName.includes(pn) || pn.includes(partName))) {
        score += WEIGHT.PART_NAME_MATCH;
        partMatched = true;
        reasons.push(`part matched by name: ${product.partCatalog?.name ?? ''}`);
      } else if (partAliases.some((a) => norm(a) === pn)) {
        score += WEIGHT.PART_ALIAS_MATCH;
        partMatched = true;
        reasons.push(`part matched by alias`);
      }
    }

    // توکن‌های نام قطعهٔ گفته‌شده (برای امتیاز قطعه و نیز تشخیص موقعیت جلو/عقب).
    const partNameTokens = input.partName
      ? norm(input.partName)
          .split(/\s+/)
          .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t))
      : [];

    /**
     * «بدون X» یعنی محصول دقیقاً فاقد X است — نباید برای X امتیاز قطعه بگیرد.
     * بدون این، «سیلندر ترمز جلو راست پراید بدون لنت» برای گفتارِ «لنت جلو پراید»
     * بالاتر از خودِ لنت‌ها می‌نشیند (در bench-matcher دیده شد).
     */
    const negated = new Set<string>();
    {
      // پرانتز/اسلش هم جداکننده‌اند: «پراید سایپا(بدون لنت)» وگرنه «بدون» چسبیده
      // به کلمهٔ قبلی می‌ماند و نفی تشخیص داده نمی‌شود.
      const nameWords = name.split(/[\s()\/,،.\-]+/).filter(Boolean);
      for (let i = 0; i < nameWords.length - 1; i++) {
        if (nameWords[i] === 'بدون') negated.add(nameWords[i + 1]);
      }
    }
    const hitsName = (t: string) => !negated.has(t) && name.includes(t);

    // 1b) نام قطعهٔ گفته‌شده مستقیماً در نام خود محصول — قوی‌ترین سیگنال تمایز بین
    // محصولاتی که همگی برای یک خودرو هستند (سوپرموتور سمند vs واشر ... سمند).
    // موقعیت/سمت هویت قطعه نیست و از اعتبار قطعه کنار گذاشته می‌شود.
    {
      const hits = partNameTokens.filter(
        (t) => !POSITION_WORDS.has(t) && !SIDE_WORDS.has(t) && hitsName(t),
      );
      if (hits.length) {
        partMatched = true;
        score += Math.min(hits.length, 3) * WEIGHT.PART_NAME_IN_PRODUCT;
        reasons.push(`part name in product name: ${hits.join(', ')}`);
      }
    }

    // اگر قطعه از partCatalog شناسایی نشد، از توکن‌های محتوایی گفتار استفاده کن.
    // این توکن‌ها قبلاً از عدد/واحد/برند/خودرو/stopword پاک شده‌اند، پس هیت‌شدن
    // آن‌ها در «نام محصول» یک سیگنال واقعی قطعه است (نه صرفاً score خام) — همین
    // است که محصول درست را از محصولی که فقط با خودرو مشترک است جدا می‌کند.
    if (!partMatched) {
      // موقعیت/سمت (جلو/عقب/چپ/راست) هویت قطعه نیستند — منطق جداگانه دارند و
      // نباید اعتبار قطعه بدهند («کمک فنر جلو» نباید برای «لنت جلو» قطعه‌مچ شود).
      const nameTokenHits = tokens.filter(
        (t) => !POSITION_WORDS.has(t) && !SIDE_WORDS.has(t) && hitsName(t),
      );
      if (nameTokenHits.length) {
        partMatched = true;
        score += Math.min(nameTokenHits.length, 3) * WEIGHT.PART_TOKEN_FALLBACK;
        reasons.push(`keyword(s) matched in product name: ${nameTokenHits.join(', ')}`);
      }
    }

    // ---------- 2) مدل خودرو — اولویت دوم، با رد قطعی در صورت تناقض ----------
    let vehicleMatched = false;

    if (input.vehicleModelIds && input.vehicleModelIds.length) {
      if (product.vehicleModelId && input.vehicleModelIds.includes(product.vehicleModelId)) {
        score += WEIGHT.VEHICLE_ID_MATCH;
        vehicleMatched = true;
        reasons.push(`vehicle matched: ${product.vehicleModel?.name ?? ''}`);
      } else if (product.vehicleModelId) {
        // محصول صراحتاً برای یک خودروی دیگر است -> کاملاً حذف شود
        disqualified = true;
        reasons.push(
          `vehicle mismatch: product is for ${product.vehicleModel?.name ?? 'other vehicle'}, not the requested vehicle`,
        );
      }
      // اگر محصول vehicleModelId ندارد (قطعهٔ یونیورسال)، بی‌طرف می‌ماند — نه رد و نه امتیاز
    } else if (input.vehicleName) {
      const vn = norm(input.vehicleName);

      if (vehicleName && (vehicleName.includes(vn) || vn.includes(vehicleName))) {
        score += WEIGHT.VEHICLE_NAME_MATCH;
        vehicleMatched = true;
        reasons.push(`vehicle matched by name: ${product.vehicleModel?.name ?? ''}`);
      } else if (vehicleAliases.some((a) => norm(a) === vn)) {
        score += WEIGHT.VEHICLE_ALIAS_MATCH;
        vehicleMatched = true;
        reasons.push(`vehicle matched by alias`);
      }
    }

    // Fallback خودرو بر پایهٔ نام محصول: کاتالوگ واردشده رابطهٔ vehicleModel ندارد و
    // نام خودرو داخل خود «نام محصول» است. اگر واژهٔ خودروی گفته‌شده در نام محصول باشد،
    // امتیاز خودرو بده تا محصولاتِ همان خودرو (پراید) بالاتر از خودروهای دیگر (سمند/ریوو) بیایند.
    if (!vehicleMatched && input.vehicleName) {
      const vehicleWords = norm(input.vehicleName)
        .split(/\s+/)
        .filter((w) => w.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(w));
      if (vehicleWords.some((w) => name.includes(w))) {
        score += WEIGHT.VEHICLE_NAME_MATCH;
        vehicleMatched = true;
        reasons.push('vehicle matched in product name');
      }
    }

    // ---------- 3) برند ----------
    let brandMatched = false;

    if (input.brandId && product.brandId === input.brandId) {
      score += WEIGHT.BRAND_ID_MATCH;
      brandMatched = true;
      reasons.push(`brand matched: ${product.brand?.name ?? ''}`);
    } else if (input.brandName) {
      const bn = norm(input.brandName);

      if (brandName && (brandName.includes(bn) || bn.includes(brandName))) {
        score += WEIGHT.BRAND_NAME_MATCH;
        brandMatched = true;
        reasons.push(`brand matched by name: ${product.brand?.name ?? ''}`);
      } else if (brandAliases.some((a) => norm(a) === bn)) {
        score += WEIGHT.BRAND_ALIAS_MATCH;
        brandMatched = true;
        reasons.push(`brand matched by alias`);
      }
    }

    // ---------- 4) توضیحات — فقط tie-breaker جزئی ----------
    for (const token of tokens) {
      if (desc.includes(token)) {
        score += WEIGHT.DESCRIPTION_TOKEN_MATCH;
      }
    }

    // ---------- 5) موقعیت/سمت — جلو/عقب و چپ/راست ----------
    // کلمات موقعیت معمولاً داخل نام محصول‌اند (مثل «لنت ترمز جلو ...»). تطابق را
    // تقویت و تناقض (جلو در برابر عقب) را قویاً جریمه می‌کنیم — بدون رد قطعی،
    // چون داده‌ها همیشه این فیلد را ندارند.
    // نیت موقعیت/سمت هم از توکن‌های آزاد و هم از داخل نام قطعهٔ گفته‌شده می‌آید
    // («لنت ترمز جلو» → جلو)، تا تناقض جلو/عقب حتی وقتی داخل partName است اعمال شود.
    const positionIntent = new Set(
      [...tokens, ...partNameTokens].filter(
        (t) => POSITION_WORDS.has(t) || SIDE_WORDS.has(t),
      ),
    );
    let positionContradiction = false;
    for (const token of positionIntent) {
      if (name.includes(token)) {
        score += POSITION_MATCH_SCORE;
        reasons.push(`position/side matched: ${token}`);
      } else if (ANTONYM[token] && name.includes(ANTONYM[token])) {
        score += POSITION_CONTRADICT_SCORE;
        positionContradiction = true;
        reasons.push(
          `position/side contradiction: requested ${token}, product is ${ANTONYM[token]}`,
        );
      }
    }

    // ---------- پوشش نام ----------
    // بدون این، «اینه چپ پراید» و «اینه تاشو چپ پراید» امتیاز یکسان می‌گیرند،
    // چون هر دو همان توکن‌های گفته‌شده را دارند و کلمهٔ اضافه هزینه‌ای ندارد.
    // نتیجه: فاصلهٔ اول و دوم صفر می‌ماند و انتخاب همیشه به کارگر می‌افتد.
    //
    // اینجا می‌سنجیم چه نسبتی از نام محصول با گفتار توضیح داده شده. محصولی که
    // نامش دقیقاً همان چیزی است که گفته شد، بر محصولی که کلمات اضافه دارد
    // ترجیح داده می‌شود — بدون اینکه محصولات با نام بلند حذف شوند.
    const spokenSet = new Set([...tokens, ...partNameTokens]);
    const nameTokens = name.split(/\s+/).filter((t) => t.length >= MIN_TOKEN_LENGTH);

    if (nameTokens.length && spokenSet.size) {
      const covered = nameTokens.filter((t) => spokenSet.has(t)).length;
      const coverage = covered / nameTokens.length;
      if (covered > 0) {
        score += Math.round(NAME_COVERAGE_WEIGHT * coverage);
        reasons.push(`name coverage: ${covered}/${nameTokens.length}`);
      }
    }

    let confidence = disqualified
      ? 0
      : this.computeConfidence({
          partMatched,
          vehicleMatched,
          brandMatched,
          hasVehicleInput: !!(input.vehicleModelIds?.length || input.vehicleName),
        });

    // یک کاندید با موقعیت متناقض نباید به‌راحتی auto-confirm شود یا بالاتر بنشیند
    if (positionContradiction) {
      confidence = Math.max(0, confidence - CONFIDENCE_POSITION_PENALTY);
    }

    return {
      product,
      score,
      confidence,
      reasons,
      partMatched,
      vehicleMatched,
      brandMatched,
      disqualified,
    };
  }

  /**
   * Confidence مستقل از score خام محاسبه می‌شود؛ فقط بر اساس اینکه واقعاً
   * کدام مؤلفه‌ها (part/vehicle/brand) match شده‌اند.
   * اگر کاربر مدل خودرو را گفته ولی match نشده، کاندید در scoreCandidate
   * قبلاً disqualified شده و اصلاً به این تابع با مقدار معنادار نمی‌رسد.
   */
  /**
   * پخش کردن confidence بر اساس امتیاز خام، نسبت به بهترین کاندید.
   *
   * بهترین کاندید عدد پرچمی خودش را کامل نگه می‌دارد؛ هر کاندید دیگر به نسبت
   * فاصله‌اش از او جریمه می‌شود. با این کار فاصلهٔ اول و دوم دیگر صفر نیست و
   * می‌شود تشخیص داد «یک برندهٔ روشن» داریم یا «چند گزینهٔ هم‌وزن».
   */
  private applyRelativeConfidence(list: ScoredCandidate[]) {
    if (list.length < 2) return;

    const bestScore = Math.max(...list.map((c) => c.score));
    if (bestScore <= 0) return;

    for (const c of list) {
      const shortfall = 1 - c.score / bestScore; // ۰ برای بهترین، تا ۱
      c.confidence = Math.max(
        0,
        Math.round(c.confidence - shortfall * RELATIVE_CONFIDENCE_SPREAD),
      );
    }
  }


  private computeConfidence(f: {
    partMatched: boolean;
    vehicleMatched: boolean;
    brandMatched: boolean;
    hasVehicleInput: boolean;
  }) {
    let c = 0;

    if (f.partMatched) c += 45;

    if (f.hasVehicleInput) {
      if (f.vehicleMatched) c += 40;
      // اگر match نشده، این کاندید اصلاً اینجا نمی‌رسد (disqualified)
    } else {
      // خودرو در گفتار مشخص نشده -> این بعد را خنثی محاسبه کن تا overconfident نشویم
      c += 15;
    }

    if (f.brandMatched) c += 15;

    return Math.min(100, c);
  }
}
