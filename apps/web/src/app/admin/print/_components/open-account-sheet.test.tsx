import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OpenAccountSheet } from "./open-account-sheet";
import type { OpenAccountSheet as Sheet } from "@/lib/types";

// سربرگ و اطلاعات واریز از تنظیماتِ فروشگاه می‌خوانند؛ اینجا موضوع تست نیستند.
const getShopSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ getShopSettings }));

afterEach(() => {
  cleanup();
  getShopSettings.mockReset();
});

const DATE = "2026-08-18T08:00:00.000Z";

function line(over: Partial<Sheet["visits"][number]["lines"][number]> = {}) {
  const base = {
    id: "L1",
    productName: "لنت جلو پراید",
    sku: "1234",
    unit: "عدد",
    quantity: 10,
    returnedQuantity: 0,
    correctedQuantity: 0,
    effectiveQuantity: 10,
    unitPrice: 100_000,
    discount: 0,
    lineTotal: 1_000_000,
  };
  return { ...base, ...over };
}

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: "acc1",
    number: 7,
    status: "SETTLED",
    note: null,
    settledAt: DATE,
    createdAt: DATE,
    customerName: "رضا کریمی",
    phone: "09120000000",
    visits: [
      {
        id: "inv1",
        number: 1001,
        createdAt: DATE,
        discount: 0,
        note: null,
        gross: 1_000_000,
        net: 1_000_000,
        lines: [line()],
      },
    ],
    returns: [],
    corrections: [],
    payments: [],
    totals: {
      gross: 1_000_000,
      returns: 0,
      corrections: 0,
      net: 1_000_000,
      paid: 0,
      remaining: 1_000_000,
    },
    ...over,
  };
}

function renderSheet(s: Sheet) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getShopSettings.mockResolvedValue({ name: "فروشگاه تست" });
  return render(
    <QueryClientProvider client={client}>
      <OpenAccountSheet sheet={s} size="a4" />
    </QueryClientProvider>,
  );
}

/**
 * عددِ چاپ‌شده → عددِ جاوااسکریپت.
 * برگه ارقام فارسی چاپ می‌کند و `\d` فقط ۰-۹ لاتین را می‌گیرد، پس بدون این
 * تبدیل هر مبلغی صفر خوانده می‌شود.
 */
function readNumber(text: string): number {
  const latin = text.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  return Number(latin.replace(/[^0-9]/g, "")) || 0;
}

/**
 * مبلغِ یک ردیفِ جدولِ جمع‌ها، با برچسبش.
 *
 * جست‌وجوی متنی روی خودِ عدد کار نمی‌کند: «۵۰٬۰۰۰» داخل «۹۵۰٬۰۰۰» هم هست.
 */
function totalsRow(label: string): number {
  const row = screen
    .getAllByRole("row")
    .find((r) => {
      const cells = within(r).queryAllByRole("cell");
      return cells.length === 2 && cells[0].textContent?.trim() === label;
    });
  if (!row) throw new Error(`ردیفِ «${label}» روی برگه نیست`);
  return readNumber(within(row).queryAllByRole("cell")[1].textContent ?? "");
}

/** جمعِ ستونِ «مبلغ» از ردیف‌های کالا — همان کاری که مشتری با ماشین‌حساب می‌کند. */
function sumAmountColumn(): number {
  const rows = screen.getAllByRole("row");
  let total = 0;
  for (const row of rows) {
    // ردیفِ کالا ۵ خانه دارد؛ سرستونِ نوبت ۲ خانه و هدرِ جدول th است.
    const cells = within(row).queryAllByRole("cell");
    if (cells.length !== 5) continue;
    total += readNumber(cells[4].textContent ?? "");
  }
  return total;
}

describe("OpenAccountSheet", () => {
  it("شماره‌ی ردیف در کلِ برگه پیوسته است، نه از هر نوبت از نو", () => {
    renderSheet(
      sheet({
        visits: [
          {
            id: "inv1",
            number: 1001,
            createdAt: DATE,
            discount: 0,
            note: null,
            gross: 200_000,
            net: 200_000,
            lines: [
              line({ id: "a", quantity: 1, effectiveQuantity: 1, lineTotal: 100_000 }),
              line({ id: "b", quantity: 1, effectiveQuantity: 1, lineTotal: 100_000 }),
            ],
          },
          {
            id: "inv2",
            number: 1002,
            createdAt: DATE,
            discount: 0,
            note: null,
            gross: 100_000,
            net: 100_000,
            lines: [
              line({ id: "c", quantity: 1, effectiveQuantity: 1, lineTotal: 100_000 }),
            ],
          },
        ],
        totals: {
          gross: 300_000,
          returns: 0,
          corrections: 0,
          net: 300_000,
          paid: 0,
          remaining: 300_000,
        },
      }),
    );

    const numbers = screen
      .getAllByRole("row")
      .map((r) => within(r).queryAllByRole("cell"))
      .filter((c) => c.length === 5)
      .map((c) => c[0].textContent);

    // ۱، ۲، ۳ — نه ۱، ۲، ۱.
    expect(numbers).toEqual(["۱", "۲", "۳"]);
  });

  it("ستونِ مبلغ با «جمع اقلام» می‌خواند و تخفیف آن را به مبلغِ نهایی می‌رساند", () => {
    renderSheet(
      sheet({
        visits: [
          {
            id: "inv1",
            number: 1001,
            createdAt: DATE,
            discount: 50_000,
            note: null,
            gross: 950_000,
            net: 950_000,
            lines: [line()],
          },
        ],
        totals: {
          gross: 950_000,
          returns: 0,
          corrections: 0,
          net: 950_000,
          paid: 0,
          remaining: 950_000,
        },
      }),
    );

    // ستونِ مبلغ ناخالص است…
    expect(sumAmountColumn()).toBe(1_000_000);
    expect(totalsRow("جمع اقلام")).toBe(1_000_000);
    // …و اختلاف صریحاً به‌عنوان تخفیف چاپ می‌شود، نه بی‌صدا گم شود.
    expect(totalsRow("تخفیف")).toBe(50_000);
    expect(totalsRow("مبلغ قابل پرداخت")).toBe(950_000);
    // برگه در هر حالت باید سرجمع بخورد.
    expect(totalsRow("جمع اقلام") - totalsRow("تخفیف")).toBe(
      totalsRow("مبلغ قابل پرداخت"),
    );
  });

  it("قلمِ کاملاً مرجوعی‌شده روی برگه می‌ماند ولی مبلغش صفر است", () => {
    renderSheet(
      sheet({
        visits: [
          {
            id: "inv1",
            number: 1001,
            createdAt: DATE,
            discount: 0,
            note: null,
            gross: 0,
            net: 0,
            lines: [
              line({
                quantity: 10,
                returnedQuantity: 10,
                effectiveQuantity: 0,
                lineTotal: 0,
              }),
            ],
          },
        ],
        totals: { gross: 0, returns: 1_000_000, corrections: 0, net: 0, paid: 0, remaining: 0 },
      }),
    );

    // نام کالا هنوز روی کاغذ هست — ناپدید شدنش بدتر از دیدنِ صفر است.
    expect(screen.getByText(/لنت جلو پراید/)).toBeTruthy();
    expect(screen.getByText(/۱۰ مرجوعی/)).toBeTruthy();
    expect(sumAmountColumn()).toBe(0);
  });

  it("چکِ پرداختی با شماره و بانک و سررسید چاپ می‌شود", () => {
    renderSheet(
      sheet({
        payments: [
          {
            receiptNumber: 55,
            createdAt: DATE,
            method: "CHEQUE",
            amount: 600_000,
            cheque: { number: "123456", bankName: "ملت", dueDate: DATE },
          },
        ],
        totals: {
          gross: 1_000_000,
          returns: 0,
          corrections: 0,
          net: 1_000_000,
          paid: 600_000,
          remaining: 400_000,
        },
      }),
    );

    expect(screen.getByText(/۱۲۳۴۵۶/)).toBeTruthy();
    expect(screen.getByText(/ملت/)).toBeTruthy();
    expect(totalsRow("پرداخت‌شده")).toBe(600_000);
    expect(totalsRow("مانده")).toBe(400_000);
  });
});
