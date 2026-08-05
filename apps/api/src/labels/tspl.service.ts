import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

/**
 * چاپ لیبل روی پرینتر حرارتی TSC با زبان TSPL.
 *
 * چرا نه HTML→تصویر:
 *  - بارکدی که خودِ پرینتر می‌کشد با نقطه‌های خودش تراز است و همیشه خوانده
 *    می‌شود؛ بارکد تصویری با مقیاس‌گیری لبه‌هایش می‌لغزد و اسکنر گاهی ردش می‌کند.
 *  - رندر کل لیبل با مرورگر یعنی حمل Chromium (~۳۰۰MB) داخل نصب‌کننده‌ی ویندوز.
 *
 * چرا متن فارسی باز هم تصویر است:
 *  فونت‌های داخلی TSC لاتین‌اند و پرینتر شکل‌دهی و اتصال حروف فارسی را بلد نیست.
 *  حتی با ریختن فونت فارسی در حافظه‌ی پرینتر، حروف جدا از هم چاپ می‌شوند. پس
 *  فقط همان یک تکه متن سمت سرور رَستر می‌شود — با `sharp` که از قبل در پروژه
 *  هست و Pango پشتش شکل‌دهی درست فارسی را انجام می‌دهد.
 */

export interface LabelSize {
  /** میلی‌متر. عرض همان جهتی است که کاغذ از پرینتر بیرون می‌آید. */
  widthMm: number;
  heightMm: number;
  /** فاصله‌ی بین دو لیبل روی رول. */
  gapMm: number;
}

export interface ProductLabelInput {
  /** بارکدی که اسکن می‌شود. */
  barcode: string;
  /** نام کالا — فارسی، به‌صورت بیت‌مپ چاپ می‌شود. */
  name: string;
}

/** ۲۰۳ dpi = ۸ نقطه بر میلی‌متر. مدل‌های TSC رومیزی همین‌اند. */
const DOTS_PER_MM = 8;

@Injectable()
export class TsplService {
  private readonly logger = new Logger(TsplService.name);

  /**
   * لیبل کالا: بارکد + نام.
   *
   * قیمت عمداً روی لیبل نیست. قیمت با هر فروش به‌روز می‌شود، پس اگر روی لیبل
   * می‌رفت هر فروش یک لیبل را باطل می‌کرد. کد کالا هرگز عوض نمی‌شود.
   */
  async buildProductLabel(
    item: ProductLabelInput,
    size: LabelSize,
    copies = 1,
  ): Promise<Buffer> {
    const wDots = Math.round(size.widthMm * DOTS_PER_MM);

    // چیدمان از بالا: نام (دو سطر جا می‌شود)، بعد بارکد، بعد خودِ کد به لاتین.
    // ارقام و حروف لاتینِ بارکد را خود پرینتر می‌نویسد؛ فقط نام فارسی تصویر است.
    /*
     * بودجه‌ی ارتفاع باید کامل بسته شود، وگرنه متنِ خوانای زیر بارکد از پایین
     * لیبل بیرون می‌زند و چاپ نمی‌شود — چیزی که فقط با شمردن نقطه‌ها معلوم
     * می‌شود، نه با نگاه به دستورها.
     */
    const hDots = Math.round(size.heightMm * DOTS_PER_MM);
    const nameTop = mm(1.5);
    const nameHeightDots = Math.round(7 * DOTS_PER_MM);
    const barcodeTop = nameTop + nameHeightDots + mm(1);
    /** ارتفاع متنِ عددیِ زیر بارکد که خود پرینتر می‌نویسد (فونت ۲). */
    const hriDots = 24;
    const bottomMargin = mm(1);
    const barcodeHeightDots = Math.max(
      40,
      hDots - barcodeTop - hriDots - bottomMargin,
    );

    const name = await this.renderPersian(
      item.name,
      wDots - mm(2) * 2,
      nameHeightDots,
    );

    const parts: (string | Buffer)[] = [
      `SIZE ${size.widthMm} mm,${size.heightMm} mm\r\n`,
      `GAP ${size.gapMm} mm,0 mm\r\n`,
      'DIRECTION 1\r\n',
      'CLS\r\n',
      // نام فارسی به‌صورت بیت‌مپ تک‌بیتی
      this.bitmapCommand(mm(2), nameTop, name),
      // بارکد Code 128 — خود پرینتر می‌کشدش، پس همیشه خوانا است.
      // 2 = عرض میله‌ی باریک، 2 = نسبت، 0 = بدون چرخش، 2 = متن زیر بارکد وسط‌چین
      `BARCODE ${mm(2)},${barcodeTop},"128",${Math.max(barcodeHeightDots, 40)},2,0,2,2,2,"${escapeTspl(item.barcode)}"\r\n`,
      `PRINT ${Math.max(1, copies)},1\r\n`,
    ];

    return Buffer.concat(
      parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p)),
    );
  }

  /**
   * متن فارسی → بیت‌مپ تک‌بیتیِ TSPL.
   *
   * TSPL بیت‌مپ را سطر به سطر و بیت به بیت می‌گیرد، و **۰ یعنی سیاه** (نقطه
   * می‌سوزد). این وارونه‌ی چیزی است که آدم انتظار دارد و منبع رایج خطاست:
   * اگر جا بیفتد، لیبل تمام‌سیاه با متن سفید بیرون می‌آید.
   */
  private async renderPersian(
    text: string,
    maxWidthDots: number,
    maxHeightDots: number,
  ): Promise<{ widthBytes: number; height: number; data: Buffer }> {
    const png = await sharp({
      text: {
        text: escapeXml(text),
        font: 'Vazirmatn, Tahoma, DejaVu Sans, sans-serif',
        width: maxWidthDots,
        height: maxHeightDots,
        align: 'right',
        rgba: false,
      },
    })
      .greyscale()
      .png()
      .toBuffer();

    const { data, info } = await sharp(png)
      .resize({
        width: maxWidthDots,
        height: maxHeightDots,
        fit: 'contain',
        position: 'right',
        background: { r: 0, g: 0, b: 0 },
      })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // TSPL هر سطر را به بایت‌های کامل گرد می‌کند.
    const widthBytes = Math.ceil(info.width / 8);
    const out = Buffer.alloc(widthBytes * info.height, 0xff); // 0xff = همه سفید

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        // sharp متن را روشن روی زمینه‌ی تیره می‌دهد؛ روشن یعنی جوهر.
        const lit = data[y * info.width + x] > 127;
        if (!lit) continue;
        const byteIndex = y * widthBytes + (x >> 3);
        // پاک‌کردن بیت = سیاه
        out[byteIndex] &= ~(0x80 >> (x & 7));
      }
    }

    return { widthBytes, height: info.height, data: out };
  }

  private bitmapCommand(
    x: number,
    y: number,
    bmp: { widthBytes: number; height: number; data: Buffer },
  ): Buffer {
    // حالت 0 = بازنویسی. هدر متنی است و بدنه باینریِ خام.
    const header = Buffer.from(
      `BITMAP ${x},${y},${bmp.widthBytes},${bmp.height},0,`,
      'latin1',
    );
    return Buffer.concat([header, bmp.data, Buffer.from('\r\n', 'latin1')]);
  }
}

const mm = (v: number) => Math.round(v * DOTS_PER_MM);

/** نقل‌قول در دستور TSPL رشته را می‌شکند. */
function escapeTspl(v: string): string {
  return v.replace(/"/g, '');
}

function escapeXml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
