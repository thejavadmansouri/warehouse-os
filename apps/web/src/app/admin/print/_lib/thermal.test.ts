import { describe, expect, it } from "vitest";

import type { Invoice } from "@/lib/types";
import {
  buildReceiptRows,
  buildThermalBytes,
  monoFromImageData,
  rasterCommand,
  thermalLines,
  thermalTotals,
  THERMAL_WIDTH_80MM,
} from "./thermal";

/** فاکتورِ کوچکِ قابل‌شکل‌دهی برای هر سناریو. */
function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    number: 42,
    subtotal: 100_000,
    discount: 0,
    total: 100_000,
    paidAmount: 100_000,
    dueAmount: 0,
    status: "CONFIRMED",
    createdAt: new Date("2026-08-31T10:00:00Z").toISOString(),
    customer: null,
    payments: [],
    lines: [],
    ...over,
  };
}

function line(over: Partial<Invoice["lines"][number]> = {}): Invoice["lines"][number] {
  return {
    id: "l-1",
    quantity: 1,
    unitPrice: 50_000,
    product: { id: "p-1", name: "لنت ترمز", unit: "عدد" },
    location: { id: "loc-1", name: "قفسه ۱", code: "A1", path: "A1" },
    ...over,
  };
}

describe("قلم‌های فیش — همان قواعدِ برگه‌ی کاغذی", () => {
  it("ردیفِ کاملاً برگشتی (مانده‌ی صفر) چاپ نمی‌شود", () => {
    const inv = invoice({
      lines: [line({ quantity: 5, netQuantity: 0 }), line({ id: "l-2", quantity: 3, netQuantity: 3 })],
      refundTotal: 100_000,
    });
    const rows = thermalLines(inv);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
  });

  it("با مرجوعی، قیمتِ مؤثر هر واحد می‌آید و تخفیفِ ردیفی صفر می‌شود", () => {
    const inv = invoice({
      lines: [line({ quantity: 5, netQuantity: 3, unitPrice: 100_000, effectiveUnitPrice: 90_000, lineDiscount: 10_000 })],
      refundTotal: 50_000,
    });
    const rows = thermalLines(inv);
    expect(rows[0].unitPrice).toBe(90_000);
    expect(rows[0].discount).toBe(0);
    expect(thermalTotals(inv, rows).perLineKnown).toBe(false);
  });

  it("بدون مرجوعی: قیمتِ تصحیح‌شده + تخفیفِ ردیفی محفوظ است", () => {
    const inv = invoice({
      lines: [line({ quantity: 2, currentUnitPrice: 100_000, netLineDiscount: 20_000 })],
    });
    const rows = thermalLines(inv);
    const t = thermalTotals(inv, rows);
    expect(rows[0].unitPrice).toBe(100_000);
    expect(rows[0].discount).toBe(20_000);
    expect(t.perLineKnown).toBe(true);
    expect(t.linesGross).toBe(200_000);
  });
});

describe("مبلغ قابل پرداخت — همیشه با وجهِ برگشتی", () => {
  it("payable = total − refundTotal و هرگز منفی نمی‌شود", () => {
    const inv = invoice({ total: 300_000, refundTotal: 400_000 });
    const t = thermalTotals(inv, thermalLines(inv));
    expect(t.payable).toBe(0);
  });
});

describe("ردیف‌های برگه", () => {
  it("پرداخت‌ها با برچسبِ فارسی و چک با سررسید می‌آید", () => {
    const inv = invoice({
      payments: [
        {
          id: "r-1",
          method: "CASH",
          amount: 50_000,
        },
        {
          id: "r-2",
          method: "CHEQUE",
          amount: 50_000,
          cheque: { number: "777", dueDate: new Date("2026-09-15").toISOString() },
        },
      ],
    });
    const rows = buildReceiptRows(inv);
    const texts = rows.map((r) => ("label" in r ? r.label : "text" in r ? r.text : ""));
    expect(texts.some((x) => x.includes("نقد"))).toBe(true);
    expect(texts.some((x) => x.includes("چک") && x.includes("۷۷۷"))).toBe(true);
  });

  it("مانده‌ی نسیه فقط وقتی واقعاً مانده هست می‌آید", () => {
    const paid = buildReceiptRows(invoice({ dueAmount: 0 }));
    expect(paid.some((r) => r.kind === "pair" && r.label.includes("مانده"))).toBe(false);

    const credit = buildReceiptRows(invoice({ dueAmount: 25_000 }));
    expect(credit.some((r) => r.kind === "pair" && r.label.includes("مانده"))).toBe(true);
  });

  it("تخفیفِ فاکتور فقط بدون مرجوعی جداگانه می‌آید", () => {
    const plain = buildReceiptRows(invoice({ discount: 10_000 }));
    expect(plain.some((r) => r.kind === "pair" && r.label.includes("تخفیف فاکتور"))).toBe(true);

    const withRefund = buildReceiptRows(
      invoice({ discount: 10_000, refundTotal: 5_000, lines: [line({ quantity: 1 })] }),
    );
    expect(withRefund.some((r) => r.kind === "pair" && r.label.includes("تخفیف فاکتور"))).toBe(false);
  });

  it("سربرگ: نامِ مغازه، و نبودنش نامِ انبار", () => {
    const withShop = buildReceiptRows(invoice(), { name: "فروشگاه مرکزی", phone: "", address: "" });
    expect(withShop[0]).toMatchObject({ kind: "title", text: "فروشگاه مرکزی" });

    const noShop = buildReceiptRows(invoice({ warehouse: { id: "w", name: "انبار مرکزی", code: "M" } }));
    expect(noShop[0]).toMatchObject({ kind: "title", text: "انبار مرکزی" });
  });
});

describe("بایت‌های ESC/POS", () => {
  it("تبدیلِ ۱بیتی: سفید هیچ، سیاه همه، آستانه‌ی وسطِ خاکستری", () => {
    const white = new Uint8ClampedArray(8 * 4).fill(255);
    const w = monoFromImageData(white, 8, 1);
    expect(w.widthBytes).toBe(1);
    expect(w.rows[0]).toBe(0);

    const black = new Uint8ClampedArray(8 * 4).fill(0);
    expect(monoFromImageData(black, 8, 1).rows[0]).toBe(0xff);

    // نقطه‌ی ۱۲۸ خاکستری — زیرِ آستانه‌ی ۱۶۰ چاپ می‌شود؛ ۱۹۹ نه.
    const gray = new Uint8ClampedArray(8 * 4).fill(128);
    const g = monoFromImageData(gray, 8, 1);
    expect(g.rows[0]).toBe(0xff);
    const light = new Uint8ClampedArray(8 * 4).fill(199);
    expect(monoFromImageData(light, 8, 1).rows[0]).toBe(0);
  });

  it("عرضِ ۵۱۲ → ۶۴ بایت در ردیف؛ بیتِ چپ‌ترین پیکسلِ اول", () => {
    const data = new Uint8ClampedArray(THERMAL_WIDTH_80MM * 4).fill(255); // همه سفید
    data[0] = 0;
    data[1] = 0;
    data[2] = 0; // فقط پیکسلِ اول سیاه
    const bmp = monoFromImageData(data, THERMAL_WIDTH_80MM, 1);
    expect(bmp.widthBytes).toBe(64);
    expect(bmp.rows[0]).toBe(0x80);
    expect(bmp.rows[1]).toBe(0);
  });

  it("دستورِ رستِر: 1D 76 30 00 + عرض/ارتفاعِ little-endian", () => {
    const bmp = monoFromImageData(new Uint8ClampedArray(16 * 4).fill(0), 16, 300);
    const cmd = rasterCommand(bmp);
    expect(Array.from(cmd.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 300 & 0xff, 0x01]);
    expect(cmd.length).toBe(8 + bmp.rows.length);
  });

  it("فیشِ کامل: بازنشانی در سر، برش در ته", () => {
    const bmp = monoFromImageData(new Uint8ClampedArray(8 * 4).fill(0), 8, 2);
    const bytes = buildThermalBytes(bmp);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @
    expect(Array.from(bytes.slice(2, 6)).slice(0, 3)).toEqual([0x1d, 0x76, 0x30]); // GS v 0
    const tail = Array.from(bytes.slice(-3));
    expect(tail.slice(0, 2)).toEqual([0x1d, 0x56]); // GS V — برش
    expect(tail[2]).toBe(0x00);
  });
});

describe("رندرِ بوم", () => {
  it("در محیطِ بدون بومِ واقعی، خطای واضح می‌دهد — بایتِ غلط نمی‌سازد", async () => {
    // jsdom بومِ واقعی ندارد؛ getContext باید null برگرداند.
    const canvas = document.createElement("canvas");
    await expect(
      (async () => {
        const { renderThermalReceipt } = await import("./thermal");
        return renderThermalReceipt(canvas, invoice({ lines: [line()] }));
      })(),
    ).rejects.toThrow(/بومِ چاپ/);
  });
});
