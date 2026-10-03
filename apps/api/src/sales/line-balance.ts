import { Prisma } from '@prisma/client';

/**
 * «الان چند تا از این قلم دستِ مشتری است؟»
 *
 * سه چیز روی یک ردیفِ فاکتور اثر می‌گذارند و هر سه باید با هم حساب شوند:
 *
 *   مانده = فروشِ اصلی + اثرِ اصلاحیه‌ها − مرجوعی‌ها
 *
 * تا پیش از این، اصلاحیه فقط اصلاحیه‌ها را می‌دید و مرجوعی فقط مرجوعی‌ها را.
 * نتیجه‌اش دو خطای واقعی بود:
 *
 *   ۱. فاکتورِ ۵۰ عددی که ۲۰تایش برگشت خورده، در صفحه‌ی ویرایش هنوز ۵۰ نشان
 *      می‌داد. فروشنده که «۲۵» می‌زد فکر می‌کرد از ۳۰ کم می‌کند، ولی سیستم
 *      ۲۵ عدد را به انبار برمی‌گرداند — انبار ۲۵ عدد اضافه می‌آورد.
 *
 *   ۲. ردیفی که با اصلاحیه از ۵۰ به ۱۰ آمده بود، هنوز ۵۰ عدد «قابل‌برگشت»
 *      داشت. مشتری می‌توانست ۵۰ تا پس بدهد در حالی که فقط ۱۰ تا خریده بود.
 *
 * هر دو سرویس (اصلاحیه و مرجوعی) از همین یک تعریف می‌خوانند تا دوباره از هم
 * جدا نیفتند.
 */

export interface LineBalance {
  /** تعدادِ ردیفِ SALE، همان‌طور که در فاکتور ثبت شده. */
  sold: number;
  /** جمعِ (جدید − قدیم) روی اصلاحیه‌های همین ردیف. منفی = کم شده. */
  correctionDelta: number;
  /** جمعِ مرجوعی‌های ثبت‌شده‌ی همین ردیف. */
  returned: number;
  /** آنچه واقعاً دستِ مشتری مانده — هیچ‌وقت منفی نمی‌شود. */
  outstanding: number;
}

type Db = Prisma.TransactionClient;

/**
 * مانده‌ی همه‌ی ردیف‌های یک فاکتور، در دو کوئری.
 *
 * @param saleLogIds شناسه‌ی ردیف‌های SALEِ همان فاکتور.
 * @param soldById تعدادِ ثبت‌شده‌ی هر ردیف.
 */
export async function lineBalances(
  db: Db,
  saleLogIds: string[],
  soldById: Map<string, number>,
): Promise<Map<string, LineBalance>> {
  if (!saleLogIds.length) return new Map();

  const [corrections, returns] = await Promise.all([
    db.saleCorrectionLine.groupBy({
      by: ['saleLogId'],
      // قلمِ تازه‌ای که خودِ اصلاحیه اضافه کرده، لاگِ SALE خودش را دارد؛
      // شمردنش اینجا یعنی دو بار حساب‌شدن.
      where: { saleLogId: { in: saleLogIds }, isNewLine: false },
      _sum: { newQuantity: true, oldQuantity: true },
    }),
    db.saleReturnLine.groupBy({
      by: ['saleLogId'],
      where: { saleLogId: { in: saleLogIds } },
      _sum: { quantity: true },
    }),
  ]);

  const deltaById = new Map(
    corrections.map((c) => [
      c.saleLogId,
      (c._sum.newQuantity ?? 0) - (c._sum.oldQuantity ?? 0),
    ]),
  );
  const returnedById = new Map(
    returns.map((r) => [r.saleLogId, r._sum.quantity ?? 0]),
  );

  const out = new Map<string, LineBalance>();
  for (const id of saleLogIds) {
    const sold = soldById.get(id) ?? 0;
    const correctionDelta = deltaById.get(id) ?? 0;
    const returned = returnedById.get(id) ?? 0;
    out.set(id, {
      sold,
      correctionDelta,
      returned,
      outstanding: Math.max(0, sold + correctionDelta - returned),
    });
  }
  return out;
}
