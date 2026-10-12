import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
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
  /** میلی‌متر. عرض هر برچسب روی رول. */
  widthMm: number;
  heightMm: number;
  /** فاصله‌ی بین دو لیبل روی رول. */
  gapMm: number;
  /** عرض فیزیکی تکهٔ رول (مثلاً ۱۰۴). اگر نباشد = تک‌ستونه. */
  mediaWidthMm?: number | null;
}

export interface LocationLabelInput {
  /** مقدار داخل QR (معمولاً barcode موقعیت). */
  barcode: string;
  /** عدد درشت کنار QR (مثل 100200_big). */
  shortNum: string;
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
      `BARCODE ${mm(2)},${barcodeTop},"128",${Math.max(barcodeHeightDots, 40)},2,0,2,2,"${escapeTspl(item.barcode)}"\r\n`,
      `PRINT ${Math.max(1, copies)},1\r\n`,
    ];

    return Buffer.concat(
      parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p)),
    );
  }

  /**
   * رول لیبل کالا — مثل چیدمان قفسه/اپ فروشنده: SIZE = عرض رول × ارتفاع،
   * چند ستون مساوی، هر سلول نام (بیت‌مپ) + بارکد. صف = هر آیتم به تعداد
   * کپی‌اش؛ هر ردیفِ پر به تعداد ستون‌ها روی یک feed می‌نشیند.
   *
   * چرا این و نه buildProductLabel برای هر کالا: با SIZE 34mm تک‌ستونه، هر
   * لیبل یک استیکر را پر می‌کرد و بقیهٔ عرض رول هدر می‌رفت — لیبل‌ها یکی‌یکی
   * و پشت هم از رول می‌آمدند.
   */
  async buildProductRoll(
    items: { item: ProductLabelInput; copies: number }[],
    size: LabelSize,
  ): Promise<Buffer> {
    const mediaW = Math.max(
      size.widthMm,
      Math.round(size.mediaWidthMm && size.mediaWidthMm >= size.widthMm
        ? size.mediaWidthMm
        : 104),
    );
    const cols = Math.max(1, Math.floor(mediaW / size.widthMm));
    // تقسیم مساوی مثل رول قفسه — سلول‌ها روی ستون‌های die-cut می‌نشینند.
    const cellDots = Math.floor((mediaW * DOTS_PER_MM) / cols);
    const wDots = Math.round(size.widthMm * DOTS_PER_MM);
    const hDots = Math.round(size.heightMm * DOTS_PER_MM);

    const nameTop = mm(1.5);
    const nameHeightDots = Math.round(7 * DOTS_PER_MM);
    const barcodeTop = nameTop + nameHeightDots + mm(1);
    /** ارتفاع متنِ عددی زیر بارکد که خود پرینتر می‌نویسد (فونت ۲). */
    const hriDots = 24;
    const bottomMargin = mm(1);
    const barcodeHeightDots = Math.max(
      40,
      hDots - barcodeTop - hriDots - bottomMargin,
    );
    const maxNameWidth = Math.max(32, wDots - mm(2) * 2);

    const parts: (string | Buffer)[] = [
      `SIZE ${mediaW} mm,${size.heightMm} mm\r\n`,
      `GAP ${size.gapMm} mm,0 mm\r\n`,
      'DIRECTION 1\r\n',
    ];

    const queue: ProductLabelInput[] = [];
    for (const { item, copies } of items) {
      const n = Math.max(1, Math.min(500, Math.floor(copies) || 1));
      for (let c = 0; c < n; c++) queue.push(item);
    }

    // بیت‌مپ نام هر کالا فقط یک بار رندر می‌شود.
    const nameCache = new Map<string, Awaited<ReturnType<typeof this.renderPersian>>>();
    for (const item of queue) {
      if (!nameCache.has(item.name)) {
        nameCache.set(
          item.name,
          await this.renderPersian(item.name, maxNameWidth, nameHeightDots),
        );
      }
    }

    for (let start = 0; start < queue.length; start += cols) {
      const row = queue.slice(start, start + cols);
      parts.push('CLS\r\n');
      for (let slot = 0; slot < row.length; slot++) {
        const item = row[slot]!;
        const xOffset = slot * cellDots;
        parts.push(
          this.bitmapCommand(xOffset + mm(2), nameTop, nameCache.get(item.name)!),
        );
        // 2 = متن زیر بارکد وسط‌چین — همان پارامترهای لیبل تک‌ستونه.
        parts.push(
          // بدون پارامتر alignment — با آن، بارکد وسطِ کل عرض SIZE می‌افتد و
          // از سلولِ خودش بیرون می‌زند؛ با x مستقیم زیرِ اسمِ همان سلول.
          `BARCODE ${xOffset + mm(2)},${barcodeTop},"128",${barcodeHeightDots},2,0,2,2,"${escapeTspl(item.barcode)}"\r\n`,
        );
      }
      parts.push('PRINT 1,1\r\n');
    }

    return Buffer.concat(
      parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p)),
    );
  }

  /**
   * رول قفسه مثل 100200_big: SIZE = عرض رول × ارتفاع، چند ستون مساوی،
   * هر سلول QR + عدد درشت.
   */
  async buildLocationRoll(
    labels: LocationLabelInput[],
    size: LabelSize,
  ): Promise<Buffer> {
    const mediaW = Math.max(
      size.widthMm,
      Math.round(size.mediaWidthMm && size.mediaWidthMm >= size.widthMm
        ? size.mediaWidthMm
        : 104),
    );
    const cols = Math.max(1, Math.floor(mediaW / size.widthMm));
    const cellDots = Math.floor((mediaW * DOTS_PER_MM) / cols);
    const hDots = Math.round(size.heightMm * DOTS_PER_MM);
    const pad = mm(2.2);
    const gap = mm(2);
    const qrDots = Math.max(
      24,
      Math.min(hDots - pad * 2, Math.min(mm(19), Math.round(cellDots * 0.55))),
    );

    const parts: (string | Buffer)[] = [
      `SIZE ${mediaW} mm,${size.heightMm} mm\r\n`,
      `GAP ${size.gapMm} mm,0 mm\r\n`,
      'DIRECTION 1\r\n',
    ];

    for (let start = 0; start < labels.length; start += cols) {
      const row = labels.slice(start, start + cols);
      parts.push('CLS\r\n');
      for (let slot = 0; slot < row.length; slot++) {
        const l = row[slot]!;
        const xOffset = slot * cellDots;
        const qrBmp = await this.renderQrBitmap(l.barcode, qrDots);
        parts.push(this.bitmapCommand(xOffset + pad, pad, qrBmp));
        const num = (l.shortNum || '?').trim() || '?';
        const textX = xOffset + pad + qrDots + gap;
        const textW = Math.max(32, cellDots - pad * 2 - qrDots - gap);
        const textH = Math.max(24, hDots - pad * 2);
        const numBmp = await this.renderBigNumber(num, textW, textH);
        parts.push(this.bitmapCommand(textX, pad, numBmp));
      }
      parts.push('PRINT 1,1\r\n');
    }

    return Buffer.concat(
      parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p)),
    );
  }

  private async renderQrBitmap(
    data: string,
    sizeDots: number,
  ): Promise<{ widthBytes: number; height: number; data: Buffer }> {
    const png = await QRCode.toBuffer(data, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: sizeDots,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const { data: raw, info } = await sharp(png)
      .resize(sizeDots, sizeDots, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const widthBytes = Math.ceil(info.width / 8);
    const out = Buffer.alloc(widthBytes * info.height, 0xff);
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const dark = raw[y * info.width + x]! < 128;
        if (!dark) continue;
        out[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
      }
    }
    return { widthBytes, height: info.height, data: out };
  }

  private async renderBigNumber(
    text: string,
    maxWidthDots: number,
    maxHeightDots: number,
  ): Promise<{ widthBytes: number; height: number; data: Buffer }> {
    const png = await sharp({
      text: {
        text: escapeXml(text),
        font: 'Arial Black, Helvetica-Bold, Arial, sans-serif',
        width: maxWidthDots,
        height: maxHeightDots,
        align: 'center',
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
        position: 'centre',
        background: { r: 0, g: 0, b: 0 },
      })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const widthBytes = Math.ceil(info.width / 8);
    const out = Buffer.alloc(widthBytes * info.height, 0xff);
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const lit = data[y * info.width + x]! > 127;
        if (!lit) continue;
        out[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
      }
    }
    return { widthBytes, height: info.height, data: out };
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
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
