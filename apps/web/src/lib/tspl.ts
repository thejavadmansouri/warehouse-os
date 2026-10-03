/**
 * ساخت دستورهای TSPL سمت کلاینت — برای «چاپ مستقیم (حرارتی)» لیبل کالا از داخل
 * اپ فروشنده (Tauri). منطقش پورتِ وفادارِ `apps/api/src/labels/tspl.service.ts`
 * است: همان ابعاد، همان چیدمان، همان بسته‌بندی بیت‌ها.
 *
 * چرا سمت کلاینت؟ چون پرینترِ حرارتی به همان ماشینی وصل است که اپ فروشنده روی
 * آن اجرا می‌شود، نه به سرورِ API. وب فقط دستورهای TSPL را می‌سازد و با پل
 * دسکتاپ (`print_tsp_label`) می‌فرستد؛ آن‌جا با datatype=RAW به spooler داده
 * می‌شود و درایور دور می‌ماند.
 */

export interface TsplLabel {
  /** مقدار بارکد — کد کالا (SKU). */
  barcode: string;
  /** متن بالای لیبل — مدل خودرو یا نام کوتاه کالا. */
  name: string;
}

export interface TsplLabelSize {
  widthMm: number;
  heightMm: number;
  gapMm: number;
  /**
   * عرض فیزیکی رول. بزرگ‌تر از widthMm یعنی چند لیبل کنار هم — مثل رول ۱۰۰ با
   * دو لیبل ۵۰×۳۰. خالی = همان عرض خود لیبل (تک‌ستونه).
   */
  mediaWidthMm?: number | null;
}

/** ۲۰۳ dpi = ۸ نقطه بر میلی‌متر. مدل‌های TSC رومیزی همین‌اند. */
const DOTS_PER_MM = 8;
const mm = (v: number) => Math.round(v * DOTS_PER_MM);

const FONT_FAMILY = "Vazir, Vazirmatn, Tahoma, sans-serif";

/**
 * بایت‌های خام TSPL برای چاپ چند لیبل (هر آیتم با تعداد کپی خودش) روی یک رول.
 *
 * چیدمان هر لیبل (مطابق نسخه‌ی سرور): از بالا نام (دو سطر جا می‌شود)، بعد
 * بارکد CODE128 که خودِ پرینتر می‌کشد + عددِ زیرش (HRI) — ارقام لاتین را خودِ
 * پرینتر می‌نویسد؛ فقط متنِ فارسی نام، بیت‌مپ می‌شود.
 */
export function buildProductTsplPayload(
  items: { label: TsplLabel; copies: number }[],
  size: TsplLabelSize,
): Uint8Array {
  const wDots = Math.round(size.widthMm * DOTS_PER_MM);
  const hDots = Math.round(size.heightMm * DOTS_PER_MM);
  /** رول می‌تواند چند لیبل کنار هم جا بدهد (مثلاً ۱۰۰/۵۰ = ۲ ستون). */
  const mediaWidth =
    size.mediaWidthMm && size.mediaWidthMm >= size.widthMm
      ? size.mediaWidthMm
      : size.widthMm;
  const cols = Math.max(1, Math.floor(mediaWidth / size.widthMm));

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

  // هر ستونِ رول به اندازه‌ی عرض خودِ لیبل طرح می‌گیرد؛ فقط جابه‌جایی افقی فرق دارد.
  const maxNameWidth = wDots - mm(2) * 2;

  const parts: (string | Uint8Array)[] = [
    // اندازه‌ی فیزیکی رول: مثلاً 100mm عرض — هر چاپ یک «لیبل فیزیکی» است که
    // چند برچسبِ ۵۰×۳۰ کنار هم داخلش می‌نشیند.
    `SIZE ${mediaWidth} mm,${size.heightMm} mm\r\n`,
    `GAP ${size.gapMm} mm,0 mm\r\n`,
    "DIRECTION 1\r\n",
  ];

  // همه‌ی برچسب‌ها با تعداد کپی‌ها یک صف می‌سازند؛ هر «لیبل فیزیکی» چندتای
  // اول صف را کنار هم می‌چیند. اگر صف فرد بود، خانه‌ی آخر خالی می‌ماند.
  const queue: TsplLabel[] = [];
  for (const item of items) {
    const copies = Math.max(1, Math.min(500, Math.floor(item.copies) || 1));
    for (let c = 0; c < copies; c++) queue.push(item.label);
  }

  for (let start = 0; start < queue.length; start += cols) {
    const row = queue.slice(start, start + cols);
    parts.push("CLS\r\n");
    row.forEach((label, slot) => {
      const xOffset = slot * wDots;
      const name = renderNameBitmap(label.name, maxNameWidth, nameHeightDots);
      parts.push(bitmapCommand(xOffset + mm(2), nameTop, name));
      // 2 = متن زیر بارکد وسط‌چین — همان پارامترهای نسخه‌ی سرور.
      parts.push(
        `BARCODE ${xOffset + mm(2)},${barcodeTop},"128",${Math.max(
          barcodeHeightDots,
          40,
        )},2,0,2,2,2,"${escapeTspl(label.barcode)}"\r\n`,
      );
    });
    parts.push("PRINT 1,1\r\n");
  }

  return concatBytes(parts);
}

/**
 * متن فارسی → بیت‌مپ تک‌بیتی TSPL.
 *
 * TSPL بیت‌مپ را سطر به سطر و بیت به بیت می‌گیرد، و **۰ یعنی سیاه** (نقطه
 * می‌سوزد). این وارونه‌ی چیزی است که آدم انتظار دارد و منبع رایج خطاست.
 * متن با canvas رندر می‌شود — Chromium شکل‌دهیِ درستِ فارسی را با HarfBuzz
 * انجام می‌دهد و فونت Vazir/Tahoma روی ویندوز هست.
 */
function renderNameBitmap(
  text: string,
  maxWidth: number,
  maxHeight: number,
): { widthBytes: number; height: number; data: Uint8Array } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, maxWidth);
  canvas.height = Math.max(1, maxHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const { lines, fontSize } = layoutLines(ctx, text, canvas.width - 8);
  const lineH = Math.min(44, Math.floor(canvas.height / Math.max(1, lines.length)));
  const startY =
    canvas.height / 2 - (lines.length * lineH) / 2 + lineH / 2;

  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#000";
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width - 4, startY + i * lineH);
  });

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // TSPL هر سطر را به بایت‌های کامل گرد می‌کند.
  const widthBytes = Math.ceil(canvas.width / 8);
  const out = new Uint8Array(widthBytes * canvas.height).fill(0xff); // 0xff = همه سفید

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      // متن سیاه روی زمینه‌ی سفید؛ کانال قرمز برای سنجش تیرگی کافی است.
      const lit = img[(y * canvas.width + x) * 4] > 127;
      if (!lit) continue;
      const byteIndex = y * widthBytes + (x >> 3);
      // پاک‌کردن بیت = سیاه
      out[byteIndex] &= ~(0x80 >> (x & 7));
    }
  }

  return { widthBytes, height: canvas.height, data: out };
}

/**
 * اندازه‌ی قلم را طوری پیدا می‌کند که متن در یک خط جا بگیرد؛ اگر نشد دو خط
 * (شکستن روی فاصله‌ها). متن فارسیِ چیده‌شده همیشه از راست خوانده می‌شود.
 */
function layoutLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): { lines: string[]; fontSize: number } {
  const trySize = (size: number): string[] | null => {
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) return [text];
    const wrapped = wrapWords(ctx, text.split(" "), maxWidth);
    return wrapped.length <= 2 ? wrapped : null;
  };

  for (let size = 42; size >= 18; size -= 2) {
    const lines = trySize(size);
    if (lines) return { lines, fontSize: size };
  }
  // آخرِ کار: کوچک‌ترین اندازه، دو خطِ اول.
  ctx.font = `bold 18px ${FONT_FAMILY}`;
  return { lines: wrapWords(ctx, text.split(" "), maxWidth).slice(0, 2), fontSize: 18 };
}

function wrapWords(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** دستور BITMAP — هدر متنی و بدنه‌ی باینریِ خام (حالت 0 = بازنویسی). */
function bitmapCommand(
  x: number,
  y: number,
  bmp: { widthBytes: number; height: number; data: Uint8Array },
): Uint8Array {
  const header = new TextEncoder().encode(
    `BITMAP ${x},${y},${bmp.widthBytes},${bmp.height},0,`,
  );
  const out = new Uint8Array(header.length + bmp.data.length + 2);
  out.set(header, 0);
  out.set(bmp.data, header.length);
  out[out.length - 2] = 0x0d; // \r\n
  out[out.length - 1] = 0x0a;
  return out;
}

function concatBytes(parts: (string | Uint8Array)[]): Uint8Array {
  const enc = new TextEncoder();
  const buffers = parts.map((p) =>
    typeof p === "string" ? enc.encode(p) : p,
  );
  const total = buffers.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

/** نقل‌قول در دستور TSPL رشته را می‌شکند. */
function escapeTspl(v: string): string {
  return v.replace(/"/g, "");
}

export interface TsplLocationLabel {
  /** کیوآرِ قفسه — data:image/png;base64 (همان که لیبلِ bulk می‌دهد). */
  qrCode: string;
  /** کدِ موقعیت (لاتین، خودِ پرینتر می‌نویسد). */
  code: string;
  /** آدرسِ کامل (فارسی، بیت‌مپ می‌شود). */
  pathText: string;
}

/**
 * بایت‌های خام TSPL برای چاپ لیبلِ **قفسه** روی رول حرارتی.
 *
 * چیدمانِ هر لیبل «کیوآر-محور» است (همان زبانِ نسخهٔ PDF): کیوآرِ بزرگِ
 * قابلِ اسکن با موبایل یک طرف، کدِ درشتِ لاتین + آدرسِ بیت‌مپِ فارسی طرفِ
 * دیگر. رولِ دوستونه (مثلاً ۱۰۵ با لیبل ۵۱) مثل کالا دو لیبل کنار هم می‌چیند.
 *
 * کیوآر که از سرور به‌صورت data URL می‌رسد با canvas به بیت‌مپِ تک‌بیتیِ
 * سیاه/سفید تبدیل می‌شود — threshold روی کانال آلفا، چون PNG شفاف دارد.
 */
export async function buildLocationTsplPayload(
  labels: TsplLocationLabel[],
  size: TsplLabelSize,
): Promise<Uint8Array> {
  const wDots = Math.round(size.widthMm * DOTS_PER_MM);
  const hDots = Math.round(size.heightMm * DOTS_PER_MM);
  const mediaWidth =
    size.mediaWidthMm && size.mediaWidthMm >= size.widthMm
      ? size.mediaWidthMm
      : size.widthMm;
  const cols = Math.max(1, Math.floor(mediaWidth / size.widthMm));

  const pad = mm(1.5);
  const qrDots = Math.max(24, hDots - pad * 2);
  // کدِ لاتین: فونت ۴ (تقریباً ۳۲ نقطه بلند) — بلندترین فونتِ داخلیِ TSC.
  const codeFontH = 32;
  const pathTop = pad + codeFontH + mm(0.8);
  const pathH = Math.max(16, hDots - pathTop - pad);

  const parts: (string | Uint8Array)[] = [
    `SIZE ${mediaWidth} mm,${size.heightMm} mm\r\n`,
    `GAP ${size.gapMm} mm,0 mm\r\n`,
    "DIRECTION 1\r\n",
  ];

  const queue = labels;
  for (let start = 0; start < queue.length; start += cols) {
    const row = queue.slice(start, start + cols);
    parts.push("CLS\r\n");
    for (let slot = 0; slot < row.length; slot++) {
      const l = row[slot]!;
      const xOffset = slot * wDots;
      const qr = await renderQrBitmapAsync(l.qrCode, qrDots);
      if (qr) {
        parts.push(bitmapCommand(xOffset + pad, pad, qr));
      }
      // متنِ آدرس بیت‌مپ می‌شود (فارسی است)؛ خودش پایینِ ستونِ متن می‌نشیند.
      const textX = xOffset + pad + qrDots + mm(1.2);
      const textW = Math.max(40, wDots - pad * 2 - qrDots - mm(1.2));
      const path = renderPathBitmap(l.pathText, textW, pathH);
      if (path) {
        parts.push(bitmapCommand(textX, pathTop, path));
      }
      // کدِ موقعیت با فونت داخلی پرینتر — همیشه تیز و خوانا.
      parts.push(
        `TEXT ${textX},${pad},"4",0,1,1,2,"${escapeTspl(l.code)}"\r\n`,
      );
    }
    parts.push("PRINT 1,1\r\n");
  }

  return concatBytes(parts);
}

/**
 * کیوآرِ data URL → بیت‌مپِ تک‌بیتیِ TSPL. ناهمگام است چون decode تصویر
 * ناهمگام است؛ اگر رندر ناموفق بود null برمی‌گردد و لیبل بدون کیوآر چاپ
 * می‌شود (کدِ متنی هنوز آدرس را لو می‌دهد).
 */
async function renderQrBitmapAsync(
  dataUrl: string,
  sizeDots: number,
): Promise<{ widthBytes: number; height: number; data: Uint8Array } | null> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = sizeDots;
    canvas.height = sizeDots;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const widthBytes = Math.ceil(canvas.width / 8);
    const out = new Uint8Array(widthBytes * canvas.height).fill(0xff);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        // کیوآر: سیاه = پرینت. روی زمینهٔ سفید، تیرگیِ کانالِ آبی کافی است.
        const dark = imgData[i + 3] > 127 && imgData[i] < 128;
        if (!dark) continue;
        const byteIndex = y * widthBytes + (x >> 3);
        out[byteIndex] &= ~(0x80 >> (x & 7));
      }
    }
    return { widthBytes, height: canvas.height, data: out };
  } catch {
    return null;
  }
}

/**
 * آدرسِ فارسی → بیت‌مپ. از همان `renderNameBitmap` استفاده می‌کنیم ولی
 * شروعِ متن از راستِ ناحیه — چون آدرس از راست خوانده می‌شود.
 */
function renderPathBitmap(
  text: string,
  maxWidth: number,
  maxHeight: number,
): { widthBytes: number; height: number; data: Uint8Array } | null {
  if (!text || !text.trim()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, maxWidth);
  canvas.height = Math.max(1, maxHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  // آدرس ممکن است چند بخش داشته باشد؛ تا دو خطِ کوچک جا می‌دهیم.
  const { lines, fontSize } = layoutLines(ctx, text, canvas.width - 8);
  const lineH = Math.min(30, Math.floor(canvas.height / Math.max(1, lines.length)));
  const startY = canvas.height / 2 - (lines.length * lineH) / 2 + lineH / 2;
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#000";
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width - 4, startY + i * lineH);
  });

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const widthBytes = Math.ceil(canvas.width / 8);
  const out = new Uint8Array(widthBytes * canvas.height).fill(0xff);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const lit = img[(y * canvas.width + x) * 4] > 127;
      if (!lit) continue;
      const byteIndex = y * widthBytes + (x >> 3);
      out[byteIndex] &= ~(0x80 >> (x & 7));
    }
  }
  return { widthBytes, height: canvas.height, data: out };
}