import { amount, faDate, money, PAYMENT_LABELS, toFa } from "@/lib/format";
import type { Invoice } from "@/lib/types";

/**
 * فیش حرارتی ۸۰ میلی‌متری — سازنده‌ی ESC/POS.
 *
 * چرا **بیت‌مپ** و نه متنِ ESC/POS؟ پرینترهای حرارتیِ رایجِ مغازه‌ها فارسی را
 * با کدپیج‌هایشان چاپ می‌کنند و حروفِ چسبیده را **شکل نمی‌دهند**: «لنت» به‌شکل
 * «ل ن ت» و چپ‌به‌راست بیرون می‌آید. راهِ درست و رایجِ نرم‌فروشی‌های ایرانی،
 * رندرِ حروف با فونتِ واقعی روی canvas و ارسالِ تصویر با دستورِ رستِر
 * `GS v 0` است — دقیقاً همان‌طوری که فارسیِ همین برنامه در همه‌جا درست
 * دیده می‌شود.
 *
 * ساختارِ فایل عمداً سه‌لایه است تا تست‌پذیر بماند:
 *   ۱. `buildReceiptRows` — محتوا و قواعدِ برگه (خالص؛ مثل invoice-sheet)
 *   ۲. بایت‌های ESC/POS (خالص — روی هر داده‌ای قابل تست)
 *   ۳. `renderThermalReceipt` — اجرای بوم در مرورگرِ واقعی
 *
 * قواعدِ محتوا دقیقاً همان برگه‌ی A4/A5 است: فقط وضعیتِ نهاییِ خالص —
 * ردیفِ کاملاً برگشتی چاپ نمی‌شود، قیمتِ مؤثر با مرجوعی، و مانده‌ی نسیه فقط
 * وقتی واقعاً مانده دارد.
 */

// ---------------------------------------------------------------------------
// ۱) محتوا — ردیف‌های برگه
// ---------------------------------------------------------------------------

export type ReceiptRow =
  | { kind: "title"; text: string } // سربرگِ درشتِ وسط (نام مغازه)
  | { kind: "muted"; text: string } // تلفن/آدرس — وسط، ریز
  | { kind: "sep" } // خط‌چینِ جداکننده
  | { kind: "text"; text: string; strong?: boolean } // ساده، راست‌چین
  | { kind: "note"; text: string } // توضیحِ ریز
  | {
      // لیبل راست، مبلغ چپ — چیدمانِ استانداردِ فیش
      kind: "pair";
      label: string;
      value: string;
      strong?: boolean;
    }
  | { kind: "center"; text: string }; // پاورقیِ وسط

/** بخش‌های تنظیماتِ فروشگاه که سربرگِ فیش لازم دارد. */
export type ReceiptShop = Pick<import("@/lib/types").ShopSettings, "name" | "phone" | "address">;

/** یک قلمِ فیش، بعد از اعمالِ قواعدِ وضعیتِ نهایی. */
export interface ReceiptLine {
  name: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  note?: string | null;
}

/** اجزای مالیِ فیش — همان جمع‌هایی که پای برگه‌ی A4/A5 می‌نشیند. */
export interface ReceiptTotals {
  linesGross: number;
  lineDiscounts: number;
  perLineKnown: boolean;
  invoiceDiscount: number;
  financeCharge: number;
  payable: number;
  dueAmount: number;
}

/**
 * قلم‌های نهاییِ فیش — کپیِ همان منطقِ `InvoiceSheet`:
 *   • تعداد = مانده‌ی قلم؛ ردیفِ کاملاً برگشتی حذف.
 *   • با مرجوعی، قیمت = قیمتِ مؤثرِ هر واحد و تخفیفِ ردیفی صفر
 *     (تخفیف‌ها داخلِ قیمتِ مؤثر نشسته‌اند؛ جداگانه دوبارحساب می‌شد).
 */
export function thermalLines(inv: Invoice): ReceiptLine[] {
  const refundTotal = inv.refundTotal ?? 0;
  const hasReturns = refundTotal > 0;

  return (inv.lines ?? [])
    .map((l) => {
      const quantity = l.netQuantity ?? Math.abs(l.quantity);
      const unitPrice =
        hasReturns && l.effectiveUnitPrice != null
          ? l.effectiveUnitPrice
          : (l.currentUnitPrice ?? l.unitPrice ?? 0);
      const discount = hasReturns ? 0 : (l.netLineDiscount ?? l.lineDiscount ?? 0);
      return {
        name: l.product?.name ?? "—",
        sku: l.product?.sku,
        unit: l.product?.unit,
        quantity,
        unitPrice,
        discount,
        note: l.lineNote,
      };
    })
    .filter((l) => l.quantity > 0);
}

/** جمع‌های مالی — همان فرمولِ برگه‌ی کاغذی، تا دو برگه دو عدد نگویند. */
export function thermalTotals(inv: Invoice, lines: ReceiptLine[]): ReceiptTotals {
  const refundTotal = inv.refundTotal ?? 0;
  const hasReturns = refundTotal > 0;

  const linesGross = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const lineDiscounts =
    lines.reduce((s, l) => s + l.discount, 0) ||
    (hasReturns ? 0 : Math.max(0, linesGross - inv.subtotal));

  return {
    linesGross,
    lineDiscounts,
    perLineKnown: !hasReturns && lineDiscounts > 0,
    invoiceDiscount: hasReturns ? 0 : inv.discount,
    financeCharge: inv.financeCharge ?? 0,
    payable: Math.max(0, inv.total - refundTotal),
    dueAmount: inv.dueAmount,
  };
}

/** ردیف‌های کاملِ فیش — همه‌ی محتوایی که روی کاغذ می‌آید. */
export function buildReceiptRows(
  inv: Invoice,
  shop?: ReceiptShop | null,
): ReceiptRow[] {
  const lines = thermalLines(inv);
  const t = thermalTotals(inv, lines);
  const rows: ReceiptRow[] = [];

  const shopName = shop?.name?.trim();
  rows.push({ kind: "title", text: shopName || inv.warehouse?.name || "فاکتور فروش" });
  if (shop?.phone?.trim()) rows.push({ kind: "muted", text: `تلفن: ${toFa(shop.phone)}` });
  if (shop?.address?.trim()) rows.push({ kind: "muted", text: shop.address });
  rows.push({ kind: "sep" });

  rows.push({
    kind: "pair",
    label: `شماره ${toFa(inv.number)}`,
    value: faDate(inv.createdAt),
  });
  rows.push({
    kind: "text",
    text: `خریدار: ${inv.customer?.fullName ?? "مشتری نقدی"}`,
  });
  if (inv.user) rows.push({ kind: "note", text: `فروشنده: ${inv.user.fullName}` });
  rows.push({ kind: "sep" });

  if (lines.length === 0) rows.push({ kind: "note", text: "(بدون قلم باقی‌مانده)" });

  lines.forEach((l, i) => {
    const title = l.sku ? `${l.name} · ${toFa(l.sku)}` : l.name;
    const head = toFa(i + 1) + ") ";
    rows.push({ kind: "text", text: head + title, strong: true });
    const left = l.unit ? l.unit + " " : "";
    const per = money(l.unitPrice);
    const total = money(l.quantity * l.unitPrice - l.discount);
    const qLabel = toFa(l.quantity) + " " + left;
    rows.push({ kind: "pair", label: qLabel + "× " + per, value: total });
    if (t.perLineKnown && l.discount > 0) {
      rows.push({ kind: "note", text: `تخفیف ردیف: − ${money(l.discount)}` });
    }
    if (l.note) rows.push({ kind: "note", text: l.note });
  });

  rows.push({ kind: "sep" });
  rows.push({ kind: "pair", label: "جمع اقلام", value: money(t.linesGross) });
  if (t.perLineKnown)
    rows.push({ kind: "pair", label: "تخفیف اقلام", value: `− ${money(t.lineDiscounts)}` });
  if (t.invoiceDiscount > 0)
    rows.push({ kind: "pair", label: "تخفیف فاکتور", value: `− ${money(t.invoiceDiscount)}` });
  if (t.financeCharge > 0)
    rows.push({ kind: "pair", label: "تفاوت فروش مدت‌دار", value: `+ ${money(t.financeCharge)}` });
  rows.push({ kind: "pair", label: "مبلغ قابل پرداخت", value: amount(t.payable), strong: true });
  if (t.dueAmount > 0)
    rows.push({ kind: "pair", label: "مانده (نسیه)", value: money(t.dueAmount), strong: true });
  rows.push({ kind: "sep" });

  for (const p of inv.payments ?? []) {
    rows.push({
      kind: "pair",
      label: PAYMENT_LABELS[p.method] ?? p.method,
      value: money(p.amount),
    });
    if (p.cheque) {
      rows.push({
        kind: "note",
        text: `چک ${toFa(p.cheque.number)} · سررسید ${faDate(p.cheque.dueDate)}`,
      });
    }
  }
  if (inv.note) rows.push({ kind: "note", text: `توضیح: ${inv.note}` });

  rows.push({ kind: "sep" });
  rows.push({ kind: "center", text: "نرم‌افزار کاردو" });
  return rows;
}

// ---------------------------------------------------------------------------
// ۲) بایت‌های ESC/POS — خالص و تست‌پذیر
// ---------------------------------------------------------------------------

/** بیت‌مپِ تک‌بیت: ردیف‌ها به‌صورت بسته‌بندی‌شده (چپ‌ترین پیکسل = بیتِ ۰x۸۰). */
export interface MonoBitmap {
  widthBytes: number;
  height: number;
  rows: Uint8Array; // طول = widthBytes * height
}

/**
 * تصویرِ ۸بیتی → ۱بیتی. `data` آرایه‌ی RGBAِ getImageData است.
 * پیکسلِ تیره‌تر از آستانه = چاپ (بیتِ ۱).
 */
export function monoFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 160,
): MonoBitmap {
  const widthBytes = Math.ceil(width / 8);
  const rows = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // چشمِ پرینتر: میانگینِ سادهِ کانال‌ها کافی است — متنِ سیاه روی سفید است.
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (gray < threshold) {
        rows[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { widthBytes, height, rows };
}

/** دستورِ رستِرِ ESC/POS: `GS v 0 m xL xH yL yH <data>` — m=0 (عادی). */
export function rasterCommand(bmp: MonoBitmap): Uint8Array {
  const h = bmp.height;
  const out = new Uint8Array(8 + bmp.rows.length);
  out.set([0x1d, 0x76, 0x30, 0x00, bmp.widthBytes & 0xff, (bmp.widthBytes >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff], 0);
  out.set(bmp.rows, 8);
  return out;
}

/**
 * بایت‌های کاملِ فیش: بازنشانی ← رستِر ← تغذیه ← برش.
 * `GS V 0` = برشِ کامل؛ تغذیه پیش از برش تا متنِ پایین زیرِ برنده نماند.
 */
export function buildThermalBytes(bmp: MonoBitmap): Uint8Array {
  const raster = rasterCommand(bmp);
  const out = new Uint8Array(2 + raster.length + 6);

  // ESC @ — بازنشانی، تا تنظیماتِ چاپ قبلی روی فیش بعدی اثر نگذارد.
  out[0] = 0x1b;
  out[1] = 0x40;
  out.set(raster, 2);

  // ESC d 6 — شش سطر خالی، سپس GS V 0 — برش کامل.
  const cutAt = 2 + raster.length;
  out[cutAt] = 0x1b;
  out[cutAt + 1] = 0x64;
  out[cutAt + 2] = 0x06;
  out[cutAt + 3] = 0x1d;
  out[cutAt + 4] = 0x56;
  out[cutAt + 5] = 0x00;

  return out;
}

// ---------------------------------------------------------------------------
// ۳) رندرِ بوم — فقط در مرورگرِ واقعی
// ---------------------------------------------------------------------------

/** عرضِ پیش‌فرضِ فیش ۸۰mm: ۵۱۲ نقطه در ۲۰۳dpi (حاشیه‌های امن). */
export const THERMAL_WIDTH_80MM = 512;
/** عرضِ فیش ۵۸mm. */
export const THERMAL_WIDTH_58MM = 384;

const PAD = 12;
const FONT = "'Vazirmatn Variable', Tahoma, sans-serif";

function fontFor(kind: ReceiptRow["kind"], strong = false): string {
  switch (kind) {
    case "title":
      return `bold 26px ${FONT}`;
    case "muted":
      return `12px ${FONT}`;
    case "note":
      return `12px ${FONT}`;
    case "sep":
      return `1px ${FONT}`;
    case "pair":
      return `${strong ? "bold " : ""}15px ${FONT}`;
    case "center":
      return `11px ${FONT}`;
    default:
      return `${strong ? "bold " : ""}15px ${FONT}`;
  }
}

/** شکستنِ متن به خطوطِ جادار — با اندازه‌گیریِ واقعیِ فونت. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function lineHeightFor(kind: ReceiptRow["kind"], strong = false): number {
  switch (kind) {
    case "title":
      return 38;
    case "muted":
    case "note":
      return 18;
    case "sep":
      return 16;
    case "pair":
      return strong ? 30 : 24;
    case "center":
      return 18;
    default:
      return 24;
  }
}

export interface ThermalRender {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * رسمِ فیش روی بومِ داده‌شده و برگرداندنِ بایت‌های چاپ.
 *
 * بومِ همین تابع **پیش‌نمایشِ صفحه هم هست** — فروشنده فیش را می‌بیند و بعد
 * چاپ می‌کند؛ بدون پیش‌نمایش، هر اشتباهِ محتوا یک برگِ کاغذِ دورریخته است.
 *
 * در محیطِ بدون بومِ واقعی (SSR/تست) خطای واضح می‌دهد — هیچ‌وقت بایتِ غلط
 * نمی‌سازد.
 */
export async function renderThermalReceipt(
  canvas: HTMLCanvasElement,
  inv: Invoice,
  opts: { shop?: ReceiptShop | null; width?: number } = {},
): Promise<ThermalRender> {
  const width = opts.width ?? THERMAL_WIDTH_80MM;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("بومِ چاپ در دسترس نیست — چاپ حرارتی فقط در مرورگر واقعی کار می‌کند");
  }

  // فونتِ وب باید بارگذاری شده باشد، وگرنه اندازه‌گیری با فونتِ جایگزین می‌شود
  // و شکستنِ خطوط اشتباه می‌افتد.
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // بدون فونت هم ادامه بده — Tahoma جایگزین است.
    }
  }

  const rows = buildReceiptRows(inv, opts.shop);
  const contentWidth = width - PAD * 2;

  // گذرِ اندازه‌گیری: شکستنِ خطوط و ارتفاعِ نهایی — پیش از ساختنِ بوم.
  // ردیف‌های متن‌دار ممکن است به چند خط بشکنند؛ pair و sep تک‌خط‌اند.
  const laid = rows.map((row) => {
    ctx.font = fontFor(row.kind, "strong" in row ? row.strong : false);
    if (row.kind === "sep" || row.kind === "pair") return { row, lines: 1 };
    const lines = wrapText(ctx, row.text, contentWidth).length;
    return { row, lines };
  });

  const gap = 4;
  const height =
    PAD * 2 + laid.reduce((h, l) => h + lineHeightFor(l.row.kind, "strong" in l.row ? l.row.strong : false) * l.lines + gap, 0);

  canvas.width = width;
  canvas.height = height;

  // پس‌زمینه سفید، متن سیاه — مبناِی تبدیلِ ۱بیتی.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.direction = "rtl"; // WebView2 = Chromium؛ چینشِ RTL واقعی

  let y = PAD;
  for (const { row, lines } of laid) {
    ctx.font = fontFor(row.kind, "strong" in row ? row.strong : false);
    switch (row.kind) {
      case "title": {
        ctx.textAlign = "center";
        for (const line of wrapText(ctx, row.text, contentWidth)) {
          ctx.fillText(line, width / 2, y);
          y += lineHeightFor("title");
        }
        break;
      }
      case "muted":
      case "center": {
        ctx.textAlign = "center";
        for (const line of wrapText(ctx, row.text, contentWidth)) {
          ctx.fillText(line, width / 2, y);
          y += lineHeightFor(row.kind);
        }
        break;
      }
      case "text": {
        ctx.textAlign = "right";
        for (const line of wrapText(ctx, row.text, contentWidth)) {
          ctx.fillText(line, width - PAD, y);
          y += lineHeightFor("text", row.strong);
        }
        break;
      }
      case "note": {
        ctx.textAlign = "right";
        ctx.fillStyle = "#111111";
        for (const line of wrapText(ctx, row.text, contentWidth)) {
          ctx.fillText(line, width - PAD, y);
          y += lineHeightFor("note");
        }
        ctx.fillStyle = "#000000";
        break;
      }
      case "pair": {
        ctx.textAlign = "right";
        ctx.fillText(row.label, width - PAD, y);
        ctx.textAlign = "left";
        ctx.fillText(row.value, PAD, y);
        y += lineHeightFor("pair", row.strong);
        break;
      }
      case "sep": {
        // خط‌چین: بلوک‌های ۸ نقطه‌ای با فاصله‌ی ۶ — استانداردِ فیش.
        const sy = y + 6;
        for (let x = PAD; x < width - PAD; x += 14) {
          ctx.fillRect(x, sy, Math.min(8, width - PAD - x), 2);
        }
        y += lineHeightFor("sep");
        break;
      }
    }
    y += gap;
  }

  const data = ctx.getImageData(0, 0, width, height).data;
  const bmp = monoFromImageData(data, width, height, 160);
  return { bytes: buildThermalBytes(bmp), width, height };
}
