/**
 * تست دود برای «پیش‌فاکتور سفید» — برگه‌ی قیمتِ متنی که از گوشی می‌آید و مدیر
 * قیمتش را می‌گذارد (BlankQuotationsService).
 *
 * سناریوی واقعیِ پیشخوان:
 *   ۱) کارگر از گوشی، متنِ آزاد «لنت پراید جلو» با تعداد ۳ و قیمت پیشنهادی
 *      ۱۰۰٬۰۰۰ می‌فرستد و صفِ آفلاین همان درخواست را دوباره می‌فرستد →
 *      **یک** برگه ساخته می‌شود (کلید idempotency).
 *   ۲) هیچ‌کدام از این کارها موجودی را تکان نمی‌دهد (Rule 1): موجودی همان ۴۰
 *      می‌ماند تا لحظه‌ی تبدیل.
 *   ۳) تبدیلِ زودهنگام رد می‌شود: اول «قلم بدون کالا»، بعد «قلم بدون قیمت».
 *   ۴) سیستم برای همان متن، کالای مشابه را پیشنهاد می‌دهد (نیمه‌خودکار) و مدیر
 *      وصل می‌کند و قیمتِ نهایی ۱۲۰٬۰۰۰ می‌گذارد → جمع = ۳۶۰٬۰۰۰ (پیشنهادِ
 *      گوشی در جمع نمی‌آید).
 *   ۵) تبدیل → فاکتور با متنِ قلم به‌عنوان توضیح و مکانِ قفسه؛ موجودی ۴۰ → ۳۷.
 *   ۶) تبدیلِ دوم و قیمت‌گذاریِ بعد از تبدیل رد می‌شوند (کلیدِ ثابتِ `blank-<id>`).
 *   ۷) برگه‌ی لغوشده و برگه‌ی منقضی به فاکتور نمی‌رسند.
 *
 * همه‌چیز از سرِ سرویس‌های واقعی می‌گذرد و در پایان داده‌ی خودش پاک می‌شود.
 *
 * اجرا:  npx ts-node --transpile-only prisma/smoke-blank-quotation.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { BlankQuotationsService } from '../src/sales/blank-quotations.service';
import { InventoryOperationService } from '../src/inventory-operation/inventory-operation.service';
import { buildSearchTokens } from '../src/products/search-tokens';

const TAG = 'SMOKE-BLANK';
const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? '✅' : '❌'}  ${label}: ${actual.toLocaleString('en-US')}` +
      (ok ? '' : `  (انتظار: ${expected.toLocaleString('en-US')})`),
  );
}

function checkStr(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'}  ${label}: ${actual}` + (ok ? '' : `  (انتظار: ${expected})`));
}

/** خطای موردِ انتظار را می‌گیرد و کدش را برمی‌گرداند. */
async function errorOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'بدون خطا';
  } catch (e: unknown) {
    const err = e as { response?: { error?: string }; message?: string };
    return String(err?.response?.error ?? err?.message ?? 'نامشخص');
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const blanks = app.get(BlankQuotationsService);
  const inventory = app.get(InventoryOperationService);

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error('کاربری برای تست پیدا نشد');

  /*
   * انبار پیش‌فرض را خودِ سرویس انتخاب می‌کند (قدیمی‌ترین انبار) و گوشی هیچ‌وقت
   * `warehouseId` نمی‌فرستد — پس قفسه‌ی تست هم باید داخل همان انبار ساخته شود،
   * وگرنه برگه و قفسه در دو انبارِ متفاوت می‌افتند.
   */
  const warehouse = await prisma.warehouse.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!warehouse) throw new Error('هیچ انباری تعریف نشده است');

  const stamp = Date.now();
  /*
   * نوعِ قفسه در هر انبار به ازای هر عمق یکتاست، پس از نوعِ موجودِ همان انبار
   * استفاده می‌شود و فقط وقتی انبار اصلاً نوع ندارد ساخته می‌شود (و همان‌قدر
   * هم باید پاک شود).
   */
  const existingType = await prisma.locationType.findFirst({
    where: { warehouseId: warehouse.id, depth: 1 },
    select: { id: true },
  });
  const locType = existingType
    ? { id: existingType.id }
    : await prisma.locationType.create({
        data: { warehouseId: warehouse.id, name: `${TAG} نوع`, depth: 1 },
        select: { id: true },
      });
  const location = await prisma.location.create({
    data: {
      warehouseId: warehouse.id,
      name: `${TAG} قفسه`,
      code: `${TAG}-${stamp}`,
      barcode: `${TAG}-loc-${stamp}`,
      path: `${TAG} قفسه`,
      depth: 1,
      typeId: locType.id,
    },
  });

  /*
   * نامِ کالا شامل متنِ گفته‌شده است تا پیشنهادِ نیمه‌خودکار قابل بررسی باشد و
   * بخشِ یکتایش فارسی است — موتور جست‌وجو با توکن‌های لاتین/خط‌تیره روی نامِ
   * فارسی چیزِ بی‌ربط برنمی‌گرداند وگرنه تست به جای خودِ فیچر، موتور را می‌سنجد.
   */
  const uniqueName = 'آزمایشی دودی برگه';
  const productName = `لنت پراید جلو ${uniqueName}`;
  const productSku = `${TAG}-${stamp}`;
  const product = await prisma.product.create({
    data: {
      name: productName,
      sku: productSku,
      /*
       * `searchTokens` را دیتابیس نمی‌سازد؛ خودِ `ProductsService` هنگام ساخت
       * پر می‌کند. ساختنِ خامِ کالا یعنی کالای نامرئی برای جست‌وجو — و آن‌وقت
       * تستِ پیشنهاد بی‌آنکه چیزی دربارهٔ فیچر بگوید رد می‌شود.
       */
      searchTokens: buildSearchTokens(productName, productSku, null),
    },
  });

  const invoiceIds: string[] = [];
  const stockAt = async () => {
    const row = await prisma.inventory.findFirst({
      where: { productId: product.id, locationId: location.id },
      select: { quantity: true },
    });
    return row?.quantity ?? 0;
  };

  try {
    await inventory.execute({
      type: 'IN',
      productId: product.id,
      locationId: location.id,
      quantity: 40,
      note: `${TAG} اولیه`,
      userId: user.id,
    } as any);
    check('موجودی اولیه', await stockAt(), 40);

    // ---- ۱) گوشی: متنِ آزاد + تعداد + قیمت پیشنهادی ----
    const clientRequestId = `${TAG}-${stamp}-req-1`;
    const sheet = await blanks.create(
      {
        clientRequestId,
        customerName: 'آقای آزمایشی',
        validForMinutes: 60,
        lines: [{ text: 'لنت پراید جلو', quantity: 3, suggestedPrice: 100_000 }],
      } as any,
      user.id,
    );

    check('برگه ساخته شد — شماره دارد', sheet.number > 0 ? 1 : 0, 1);
    checkStr('برگه — وضعیت OPEN', sheet.status, 'OPEN');
    check('برگه — یک قلم', sheet.lineCount, 1);
    check('برگه — قلمِ بی‌قیمت', sheet.unpricedCount, 1);
    check('برگه — قلمِ ناوصل', sheet.unlinkedCount, 1);
    // جمع فقط از قیمت نهایی ساخته می‌شود و هیچ قیمتی نهایی نشده.
    check('برگه — جمع صفر (پیشنهاد در جمع نمی‌آید)', sheet.total, 0);
    check('موجودی پس از ساختِ برگه دست‌نخورده', await stockAt(), 40);

    // ---- ۲) صفِ آفلاین همان درخواست را دوباره می‌فرستد ----
    const retry = await blanks.create(
      {
        clientRequestId,
        customerName: 'آقای آزمایشی',
        lines: [{ text: 'لنت پراید جلو', quantity: 3, suggestedPrice: 100_000 }],
      } as any,
      user.id,
    );
    checkStr('ارسال دوباره‌ی همان کلید — همان برگه', retry.id, sheet.id);
    check(
      'ارسال دوباره — برگه‌ی دوم ساخته نشد',
      await prisma.blankQuotation.count({
        where: { idempotencyKey: `mobile-${clientRequestId}` },
      }),
      1,
    );

    // ---- ۳) تبدیلِ زودهنگام رد می‌شود ----
    checkStr(
      'تبدیل پیش از وصل‌کردن کالا',
      await errorOf(() => blanks.convert(sheet.id, {}, user.id)),
      'PRODUCT_REQUIRED',
    );

    // ---- ۴) پیشنهادِ کالا برای همان متن (نیمه‌خودکار) ----
    //
    // این دیتابیس کاتالوگِ واقعی دارد، پس انتظار نداریم کالای تازه‌ساخته‌ی خودِ
    // تست در پنج پیشنهادِ اول باشد — برعکس: انتظار درست این است که نزدیک‌ترین
    // کالاهای واقعیِ کاتالوگ بیایند، چون کارِ مدیر همین وصل‌کردن به یکی از
    // همان‌هاست.
    const sug = await blanks.suggestions(sheet.id);
    check('پیشنهاد — یک ردیف', sug.length, 1);
    checkStr('پیشنهاد — وضعیت SUGGEST', sug[0].status, 'SUGGEST');
    check('پیشنهاد — متنِ موجود در کاتالوگ کاندید دارد', sug[0].candidates.length > 0 ? 1 : 0, 1);
    check(
      'پیشنهاد — همه‌ی کاندیدها شناسه‌ی کالا دارند',
      sug[0].candidates.every((c) => !!c.productId) ? 1 : 0,
      1,
    );
    checkStr(
      'پیشنهاد — بهترین = کاندیدِ اول',
      String(sug[0].best?.productId),
      String(sug[0].candidates[0].productId),
    );
    // حداکثر پنج تا: فهرستِ بلند در پنلِ مدیر به یک دیوارِ چیپ تبدیل می‌شود.
    check('پیشنهاد — حداکثر ۵ کاندید', sug[0].candidates.length <= 5 ? 1 : 0, 1);

    // وصل بدون قیمت — گاردِ دوم باید بگیرد.
    await blanks.savePrices(sheet.id, {
      lines: [{ lineId: sug[0].lineId, productId: product.id, locationId: location.id }],
    } as any);
    const afterLink = await blanks.findOne(sheet.id);
    check('وصل شد — ناوصل صفر', afterLink.unlinkedCount, 0);
    check('وصل شد — ولی بی‌قیمت', afterLink.unpricedCount, 1);
    checkStr('وصل شد — وضعیت هنوز OPEN', afterLink.status, 'OPEN');
    checkStr(
      'تبدیل با قلمِ بی‌قیمت',
      await errorOf(() => blanks.convert(sheet.id, {}, user.id)),
      'UNPRICED_LINE',
    );
    check('موجودی پس از وصل‌کردن', await stockAt(), 40);

    // ---- ۵) قیمتِ مدیر ----
    const priced = await blanks.savePrices(sheet.id, {
      lines: [{ lineId: sug[0].lineId, finalPrice: 120_000 }],
    } as any);
    check('قیمت خورد — بی‌قیمت صفر', priced.unpricedCount, 0);
    checkStr('قیمت خورد — وضعیت PRICED', priced.status, 'PRICED');
    // ۳ × ۱۲۰٬۰۰۰ — نه ۳ × ۱۰۰٬۰۰۰ (پیشنهادِ گوشی).
    check('جمع = تعداد × قیمتِ نهایی', priced.total, 360_000);
    check(
      'قیمتِ نهایی با قیمتِ پیشنهادی اشتباه نشد',
      priced.lines[0].finalPrice === 120_000 ? 1 : 0,
      1,
    );
    checkString(priced.lines[0].product?.name ?? 'ندارد', product.name);
    check('قفسه‌ی ردیف ثبت شد', priced.lines[0].locationPath ? 1 : 0, 1);
    check('موجودی پس از قیمت‌گذاری', await stockAt(), 40);

    // ---- ۶) تبدیل ----
    const invoice = await blanks.convert(
      sheet.id,
      { payments: [{ method: 'CASH', amount: 360_000 }] } as any,
      user.id,
    );
    invoiceIds.push(invoice.id);
    check('فاکتور — مبلغ کل', invoice.total, 360_000);
    check('فاکتور — تسویه‌شده', invoice.dueAmount, 0);
    // متنِ گفته‌شده روی فاکتور می‌ماند تا بعداً کسی نداند مشتری چه خواسته بود.
    check('فاکتور — یک ردیف', invoice.lines.length, 1);
    checkStr('فاکتور — توضیح ردیف', invoice.lines[0].lineNote ?? '', 'لنت پراید جلو');
    check('فاکتور — قیمت واحدِ ردیف', invoice.lines[0].unitPrice ?? 0, 120_000);
    // تنها جایی که موجودی تکان می‌خورد همین است.
    check('موجودی پس از تبدیل ۴۰ → ۳۷', await stockAt(), 37);

    const converted = await blanks.findOne(sheet.id);
    checkStr('برگه — CONVERTED', converted.status, 'CONVERTED');
    checkStr('برگه — به فاکتور وصل شد', converted.convertedInvoiceId ?? '', invoice.id);

    // ---- ۷) تبدیلِ دوم و تغییرِ بعد از تبدیل ----
    checkStr(
      'تبدیلِ دوم',
      await errorOf(() => blanks.convert(sheet.id, {}, user.id)),
      'ALREADY_CONVERTED',
    );
    checkStr(
      'ذخیره‌ی قیمت بعد از تبدیل',
      await errorOf(() =>
        blanks.savePrices(sheet.id, { lines: [{ lineId: sug[0].lineId, finalPrice: 1 }] } as any),
      ),
      'ALREADY_CONVERTED',
    );    check(
      'تبدیلِ دوم موجودی را دوباره کم نکرد',
      await prisma.saleInvoice.count({ where: { id: { in: invoiceIds } } }),
      1,
    );

    // ---- ۸) لغو ----
    const toCancel = await blanks.create(
      {
        clientRequestId: `${TAG}-${stamp}-req-2`,
        lines: [{ text: 'چیزی که مشتری برش گرداند', quantity: 1 }],
      } as any,
      user.id,
    );
    const cancelled = await blanks.cancel(toCancel.id);
    checkStr('لغو — وضعیت CANCELLED', cancelled.status, 'CANCELLED');
    checkStr(
      'تبدیلِ برگه‌ی لغوشده',
      await errorOf(() => blanks.convert(toCancel.id, {}, user.id)),
      'NOT_OPEN',
    );

    // ---- ۹) انقضا ----
    const toExpire = await blanks.create(
      {
        clientRequestId: `${TAG}-${stamp}-req-3`,
        validForMinutes: 60,
        lines: [{ text: 'برگه‌ای که می‌سوزد', quantity: 2, suggestedPrice: 50_000 }],
      } as any,
      user.id,
    );
    const expiredLineId = toExpire.lines[0].id;
    // قیمت و کالا را می‌دهیم تا فقط و فقط انقضا مانع باشد.
    await blanks.savePrices(toExpire.id, {
      lines: [
        { lineId: expiredLineId, productId: product.id, locationId: location.id, finalPrice: 90_000 },
      ],
    } as any);
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.blankQuotation.update({ where: { id: toExpire.id }, data: { validUntil: past } });

    const expiredView = await blanks.findOne(toExpire.id);
    checkStr('انقضا — وضعیت نمایشی', String(expiredView.displayStatus), 'EXPIRED');
    checkStr(
      'تبدیلِ برگه‌ی منقضی',
      await errorOf(() => blanks.convert(toExpire.id, {}, user.id)),
      'BLANK_QUOTATION_EXPIRED',
    );
    check('موجودی پس از تبدیل‌های ناموفق', await stockAt(), 37);

    // ---- ۱۰) پیشنهاد نامعتبر و متنِ یکتای کاتالوگ ----
    const exact = await blanks.create(
      {
        clientRequestId: `${TAG}-${stamp}-req-5`,
        lines: [
          // نامِ کاملِ همان کالا: نزدیک‌ترین پیشنهاد باید خودش باشد.
          { text: product.name, quantity: 1 },
          // یک حرف: جست‌وجو نباید چیزِ بی‌ربط پیشنهاد بدهد.
          { text: 'ل', quantity: 1 },
        ],
      } as any,
      user.id,
    );
    const exactSug = await blanks.suggestions(exact.id);
    /*
     * ترتیبِ قلم‌ها همان ترتیبی است که فرستاده شده — نه ترتیبِ `id`.
     * این دو خط پیش از این جابه‌جا برمی‌گشتند و هر کسی که با ایندکسِ ردیف کار
     * می‌کرد (پنل، تبدیلِ بعدی) عددِ ردیفِ دیگری را می‌گرفت.
     */
    checkStr('ترتیبِ قلم‌ها — ردیفِ اول همان اولی', exactSug[0].text, product.name);
    check('ترتیبِ قلم‌ها — ایندکسِ صفر', exactSug[0].lineIndex, 0);
    checkStr('ترتیبِ قلم‌ها — ردیفِ دوم همان دومی', exactSug[1].text, 'ل');
    check('ترتیبِ قلم‌ها — ایندکسِ یک', exactSug[1].lineIndex, 1);
    checkStr(
      'پیشنهادِ نامِ دقیق — خودِ همان کالا',
      String(exactSug[0].best?.productId),
      product.id,
    );
    checkStr('پیشنهادِ متنِ یک‌حرفی — NONE', exactSug[1].status, 'NONE');
    check('پیشنهادِ متنِ یک‌حرفی — بی‌کاندید', exactSug[1].candidates.length, 0);

    // ---- ۱۱) برگه‌ی بی‌تاریخ هیچ‌وقت منقضی نمی‌شود ----
    const forever = await blanks.create(
      {
        clientRequestId: `${TAG}-${stamp}-req-4`,
        lines: [{ text: 'قیمتِ ماندگار', quantity: 1 }],
      } as any,
      user.id,
    );
    checkStr(
      'برگه‌ی بی‌اعتبار — همچنان OPEN',
      String((await blanks.findOne(forever.id)).displayStatus),
      'OPEN',
    );

    // ---- ۱۲) فیلترهای فهرست ----
    const openList = await blanks.findAll({ status: 'OPEN', limit: 200 });
    const ids = (r: { id: string }[]) => r.map((x) => x.id);
    check('فهرست OPEN — شامل برگه‌ی بی‌تاریخ', ids(openList.data).includes(forever.id) ? 1 : 0, 1);
    check(
      'فهرست OPEN — برگه‌ی لغوشده داخلش نیست',
      ids(openList.data).includes(toCancel.id) ? 0 : 1,
      1,
    );
    const expiredList = await blanks.findAll({ status: 'EXPIRED', limit: 200 });
    check('فهرست EXPIRED — منقضی داخلش است', ids(expiredList.data).includes(toExpire.id) ? 1 : 0, 1);
    check(
      'فهرست EXPIRED — برگه‌ی بی‌تاریخ داخلش نیست',
      ids(expiredList.data).includes(forever.id) ? 0 : 1,
      1,
    );
    const convertedList = await blanks.findAll({ status: 'CONVERTED', limit: 200 });
    check('فهرست CONVERTED — برگه‌ی تبدیل‌شده', ids(convertedList.data).includes(sheet.id) ? 1 : 0, 1);
    // فهرست نباید نامِ کالا را ضمیمه کند (سنگین می‌شود) ولی شمارش‌ها باید باشند.
    const rowOfSheet = convertedList.data.find((r) => r.id === sheet.id) as any;
    check('فهرست — شمارشِ اقلام', rowOfSheet?.lineCount ?? -1, 1);
    check('فهرست — نام کالا در فهرست ضمیمه نیست', rowOfSheet?.lines?.[0]?.product ? 0 : 1, 1);
  } finally {
    // پاک‌سازی — این اسکریپت روی دیتابیس واقعی اجرا می‌شود.
    // قلم‌ها با ON DELETE CASCADE می‌روند.
    await prisma.blankQuotation.deleteMany({
      where: { idempotencyKey: { contains: TAG } },
    });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.inventoryLog.deleteMany({ where: { productId: product.id } });
    await prisma.saleInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.productPrice.deleteMany({ where: { productId: product.id } });
    await prisma.inventory.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.location.deleteMany({ where: { warehouseId: warehouse.id, code: `${TAG}-${stamp}` } });
    // نوعِ قفسه فقط اگر خودِ این اسکریپت ساخته باشدش پاک می‌شود.
    if (!existingType) await prisma.locationType.deleteMany({ where: { id: locType.id } });

    await app.close();
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? '\nهمه قبول ✅' : `\n${failures} مورد رد شد ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

/** نسخه‌ی رشته‌ایِ `check` — برای مقایسه‌های غیرعددی. */
function checkString(actual: string, expected: string) {
  checkStr('کالای وصل‌شده روی برگه', actual, expected);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
