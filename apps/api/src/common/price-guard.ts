/**
 * تشخیصِ قیمتِ خریدِ مشکوک، پیش از اینکه قیمتِ رسمیِ کالا شود.
 *
 * ### چرا لازم است
 *
 * `learnPurchasePrices` هر عددی را که وارد شود به‌عنوان قیمتِ تمام‌شده‌ی کالا
 * ثبت می‌کند، بدون هیچ بررسی. یک بارِ تومان‌زدن به‌جای ریال، قیمتِ تمام‌شده را
 * ده برابر می‌کند و از آن لحظه **هر گزارشِ سودی برای آن کالا غلط است** — بی‌صدا،
 * چون هیچ‌چیز خطا نمی‌دهد.
 *
 * این فرضی نیست: در `schema.prisma` ثبت شده که در کاتالوگِ ایمپورت‌شده بعضی
 * ردیف‌ها قیمتِ خریدشان از قیمتِ فروش بیشتر است — یعنی همین اتفاق قبلاً افتاده.
 *
 * ### چرا هشدار، نه خطا
 *
 * قیمت‌ها واقعاً می‌پرند؛ ارز عوض می‌شود و جنسِ نو با قیمتِ نو می‌آید. اگر ثبت
 * را مسدود کنیم، کاربر راه دور پیدا می‌کند — و آن راه دور دیگر دیده نمی‌شود.
 * پس تصمیم با آدم است، ولی **آگاهانه**.
 *
 * ### چرا فقط یک هشدار برای هر ردیف
 *
 * یک قیمتِ ده‌برابری معمولاً هم‌زمان از قیمتِ فروش هم بیشتر است. نشان‌دادنِ دو
 * هشدار برای یک اشتباه، فرم را شلوغ می‌کند و کاربر یاد می‌گیرد ردشان کند.
 * صریح‌ترین تشخیص برگردانده می‌شود، نه همه‌ی نشانه‌ها.
 */

/** نسبتی که بالاتر از آن، جهشِ قیمت مشکوک است. */
const JUMP_RATIO = 3;

/** ده‌برابر با این رواداری، امضای اشتباهِ تومان/ریال است. */
const TENFOLD = 10;
const TENFOLD_TOLERANCE = 0.02;

export type PriceWarningKind =
  /** دقیقاً حدودِ ده برابرِ خریدِ قبلی — تقریباً همیشه تومان به‌جای ریال. */
  | 'TENFOLD_JUMP'
  /** قیمتِ خرید از قیمتِ فروشِ فعلی بیشتر است. */
  | 'ABOVE_SALE_PRICE'
  /** جهشِ بزرگ نسبت به خریدِ قبلی. */
  | 'BIG_JUMP'
  /** افتِ بزرگ نسبت به خریدِ قبلی. */
  | 'BIG_DROP';

export interface PriceGuardInput {
  /** قیمتِ خریدِ واحد که الان وارد شده، به ریال. */
  unitPrice: number;
  /** آخرین قیمتِ خریدِ ثبت‌شده‌ی همین کالا. null یعنی اولین خرید. */
  lastPurchasePrice: number | null;
  /** قیمتِ فروشِ فعلیِ همین کالا. */
  salePrice: number | null;
}

export interface PriceWarning {
  kind: PriceWarningKind;
  /** عددی که الان وارد شده. */
  current: number;
  /** عددی که با آن مقایسه شده — خریدِ قبلی یا قیمتِ فروش. */
  previous: number;
  /** متنِ آماده برای نمایش؛ سرور مرجع است تا پیام در کلاینت‌ها فرق نکند. */
  message: string;
}

/**
 * قیمتِ یک ردیفِ خرید را می‌سنجد.
 *
 * `null` یعنی مشکوک نیست.
 *
 * قیمتِ صفر هیچ‌وقت هشدار نمی‌گیرد: صفر یعنی «هدیه یا جایگزینیِ گارانتی» و
 * `learnPurchasePrices` هم یادش نمی‌گیرد، پس چیزی خراب نمی‌شود.
 */
export function checkPurchasePrice({
  unitPrice,
  lastPurchasePrice,
  salePrice,
}: PriceGuardInput): PriceWarning | null {
  if (unitPrice <= 0) return null;

  // خریدِ قبلیِ صفر پایه‌ی مقایسه نیست — نسبت به صفر بی‌معنا است.
  const last =
    lastPurchasePrice != null && lastPurchasePrice > 0 ? lastPurchasePrice : null;

  if (last !== null) {
    const ratio = unitPrice / last;

    // ده‌برابر اول بررسی می‌شود چون تشخیصِ مشخصی می‌دهد، نه فقط «زیاد است».
    if (Math.abs(ratio - TENFOLD) <= TENFOLD * TENFOLD_TOLERANCE) {
      return {
        kind: 'TENFOLD_JUMP',
        current: unitPrice,
        previous: last,
        message:
          'قیمت دقیقاً حدود ۱۰ برابر خرید قبلی است — احتمالاً تومان به‌جای ریال وارد شده',
      };
    }

    if (ratio > JUMP_RATIO) {
      return {
        kind: 'BIG_JUMP',
        current: unitPrice,
        previous: last,
        message: 'قیمت بیش از ۳ برابر خرید قبلی این کالاست',
      };
    }

    if (ratio < 1 / JUMP_RATIO) {
      return {
        kind: 'BIG_DROP',
        current: unitPrice,
        previous: last,
        message: 'قیمت کمتر از یک‌سوم خرید قبلی این کالاست',
      };
    }
  }

  // این یکی به سابقه‌ی خرید نیاز ندارد، پس برای کالای تازه هم کار می‌کند.
  if (salePrice != null && salePrice > 0 && unitPrice > salePrice) {
    return {
      kind: 'ABOVE_SALE_PRICE',
      current: unitPrice,
      previous: salePrice,
      message: 'قیمت خرید از قیمت فروش فعلی بیشتر است',
    };
  }

  return null;
}
