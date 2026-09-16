import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { qty, rial } from "@/lib/format";
import type { LocateResult } from "@/lib/types";

import { InlineResults, type SearchResultRow } from "./inline-results";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

afterEach(() => cleanup());

/** یک نتیجه‌ی «شناخته‌شده» (از سرور، با موجودی و قفسه) — شکل خروجی /products/locate. */
const knownResult: LocateResult = {
  id: "p1",
  name: "لنت ترمز جلو",
  sku: "8010212",
  unit: null,
  partNumber: null,
  salePrice: 1_500_000,
  purchasePrice: 1_000_000,
  suggestedPrice: 1_150_000,
  managerPrice: 1_600_000,
  brandName: null,
  vehicleModelName: null,
  totalStock: 12,
  locations: [
    {
      locationId: "loc-1",
      name: "قفسه ۳",
      code: "A-3",
      path: "انبار / ردیف ۲ / قفسه ۳",
      quantity: 12,
    },
  ],
};

const knownRow: SearchResultRow = {
  kind: "known",
  id: "p1",
  nameSegments: [{ text: "لنت ترمز جلو", matched: false }],
  result: knownResult,
};

function renderResults({
  rows = [knownRow],
  highlight = -1,
  canManagePrice = true,
} = {}) {
  return render(
    <InlineResults
      rows={rows as SearchResultRow[]}
      highlight={highlight}
      loading={false}
      pickingId={null}
      canManagePrice={canManagePrice}
      onSavePrice={vi.fn()}
      onPick={vi.fn()}
      onSendToWorker={vi.fn()}
      onHover={vi.fn()}
    />,
  );
}

describe("InlineResults — ردیفِ فشرده‌ی جست‌وجو", () => {
  it("نام، قیمتِ فروش و موجودی همه در یک سطرِ فشرده دیده می‌شوند", () => {
    renderResults();
    // نامِ کالا
    expect(screen.getByText("لنت ترمز جلو")).toBeTruthy();
    // قیمتِ فروش — همان‌سطر، کنارِ نام
    expect(screen.getByText(rial(1_500_000))).toBeTruthy();
    // موجودی
    expect(screen.getByText(`موجودی ${qty(12)}`)).toBeTruthy();
    // ردیفِ فشرده — خطِ یک‌سطری با padding کوچکِ عمودی، نه نسخه‌ی چندسطریِ قبلی
    const row = screen.getByText("لنت ترمز جلو").closest("[data-row]");
    expect(row?.querySelector(".py-1\\.5")).toBeTruthy();
    // سطرِ «کد …»ی نسخه‌ی چندسطریِ قبلی دیگر وجود ندارد — کد فقط در tooltip است
    expect(screen.queryByText(/کد ۸۰۱۰۲۱۲/)).toBeNull();
  });

  it("آدرسِ قفسه‌ها در ردیفِ انتخاب‌نشده دیده نمی‌شود — لیست فشرده می‌ماند", () => {
    renderResults({ highlight: -1 });
    expect(screen.queryByText(/قفسه ۳/)).toBeNull();
  });

  it("آدرسِ قفسه‌ها فقط روی ردیفِ انتخاب‌شده باز می‌شود", () => {
    renderResults({ highlight: 0 });
    expect(screen.getByText(/انبار \/ ردیف ۲ \/ قفسه ۳/)).toBeTruthy();
  });

  it("دکمه‌ی «به کارگر» فقط روی ردیفِ انتخاب‌شده دیده می‌شود و آیکون‌فقط است", () => {
    renderResults({ highlight: -1 });
    expect(screen.queryByTitle("ارسال آدرس این کالا به کارگر")).toBeNull();

    cleanup();
    renderResults({ highlight: 0 });
    const send = screen.getByTitle("ارسال آدرس این کالا به کارگر");
    expect(send).toBeTruthy();
    // آیکون‌فقط — بدون متنِ «به کارگر» تا ردیف فشرده بماند
    expect(send.textContent ?? "").not.toContain("به کارگر");
  });

  it("فروشنده (بدون canManagePrice) فقط قیمتِ فروش و موجودی را می‌بیند — نه خرید/۱۵٪/مدیر", () => {
    renderResults({ canManagePrice: false });
    expect(screen.getByText(rial(1_500_000))).toBeTruthy();
    expect(screen.queryByText(/خرید/)).toBeNull();
    expect(screen.queryByText(/۱۵٪/)).toBeNull();
    expect(screen.queryByText(/مدیر/)).toBeNull();
  });

  it("مدیر هر چهار قیمت را در همان سطر می‌بیند", () => {
    renderResults({ canManagePrice: true });
    expect(screen.getByText(rial(1_000_000))).toBeTruthy(); // خرید
    expect(screen.getByText(rial(1_500_000))).toBeTruthy(); // فروش
    expect(screen.getByText(rial(1_150_000))).toBeTruthy(); // ۱۵٪
    expect(screen.getByText(rial(1_600_000))).toBeTruthy(); // مدیر
  });

  it("کالای بدونِ موجودی برچسبِ «بدون موجودی» می‌گیرد", () => {
    const empty: SearchResultRow = {
      kind: "known",
      id: "p2",
      nameSegments: [{ text: "روغن موتور", matched: false }],
      result: { ...knownResult, id: "p2", name: "روغن موتور", totalStock: 0, locations: [] },
    };
    renderResults({ rows: [empty] });
    expect(screen.getByText("بدون موجودی")).toBeTruthy();
  });
});