import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { money } from "@/lib/format";

import { AdjustSettlementDialog } from "./adjust-settlement-dialog";

/*
 * jsdom چند API مرورگر را ندارد که radix آن‌ها را هنگام بازشدنِ دیالوگ صدا
 * می‌زند. نبودشان ایرادِ کامپوننت نیست، کمبودِ محیط تست است.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

afterEach(() => cleanup());

const onConfirm = vi.fn();
const onClose = vi.fn();

/** گزاره‌ی «این روشِ پرداخت فعال/انتخاب‌شده است» — فعال بودن با کلاسِ primary خوانده می‌شود. */
const isMethodActive = (label: string) => {
  const btn = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.includes(label));
  return btn?.className.includes("border-primary bg-primary") ?? false;
};

function renderPayOverpaid({
  amount = 1_000_000,
  afterTotal = 2_000_000,
  paidAmount = 3_000_000,
  hasCustomer = true,
} = {}) {
  return render(
    <AdjustSettlementDialog
      open
      direction="PAY"
      amount={amount}
      beforeTotal={3_000_000}
      afterTotal={afterTotal}
      paidAmount={paidAmount}
      hasCustomer={hasCustomer}
      pending={false}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
}

describe("AdjustSettlementDialog — پرداختِ اضافه‌ی مشتری", () => {
  it("هشدارِ اضافه‌پرداخت را نشان می‌دهد وقتی paidAmount از afterTotal بیشتر باشد", () => {
    renderPayOverpaid();
    expect(
      screen.getByText(/مشتری قبلاً بیش از مبلغِ پس‌ازعملیات پرداخت کرده/),
    ).toBeTruthy();
  });

  it("در حالتِ PAY با اضافه‌پرداخت، «نسیه» (روی حساب) از ابتدا انتخاب است", () => {
    renderPayOverpaid();
    expect(isMethodActive("نسیه")).toBe(true);
    expect(isMethodActive("نقد")).toBe(false);
  });

  it("متنِ «نسیه» توضیحِ بستانکارشدن را نشان می‌دهد", () => {
    renderPayOverpaid();
    expect(
      screen.getByText(/مبلغ روی حسابِ مشتری می‌نشیند.*بستانکار می‌شود/),
    ).toBeTruthy();
  });

  it("با Enter، همان روشِ انتخاب‌شده (نسیه) با مبلغِ ویرایش‌شده تأیید می‌شود", () => {
    renderPayOverpaid();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    // قراردادِ onConfirm: (روش، چک، مبلغِ ویرایش‌شده) — مبلغ همین‌جا همان
    // اختلافِ پیش‌فرض است چون چیزی تغییر نکرده.
    expect(onConfirm).toHaveBeenCalledWith("CREDIT", undefined, 1_000_000);
  });

  it("مبلغِ اضافه‌پرداخت = paidAmount − afterTotal کنار هشدار می‌آید", () => {
    renderPayOverpaid();
    // ۱٬۰۰۰٬۰۰۰ هم در سربرگ (اختلاف) و هم در کارتِ بلاک می‌آید — یکی کافی است.
    expect(screen.getAllByText(money(1_000_000)).length).toBeGreaterThanOrEqual(1);
  });

  it("بدونِ اضافه‌پرداخت (پرداختِ عادیِ PAY) پیش‌فرض نقد است، نه نسیه", () => {
    // afterTotal بزرگ‌تر از paidAmount → مشتری کمتر پرداخته، برگشت و نه اضافه.
    renderPayOverpaid({ afterTotal: 3_000_000, paidAmount: 1_000_000 });
    expect(isMethodActive("نقد")).toBe(true);
    expect(isMethodActive("نسیه")).toBe(false);
  });

  it("فاکتورِ بدونِ مشتری در PAY نسیه ارائه نمی‌دهد — فقط نقد/کارت، و پیش‌فرض نقد", () => {
    renderPayOverpaid({ hasCustomer: false });
    expect(isMethodActive("نقد")).toBe(true);
    const creditBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("نسیه"));
    expect(creditBtn).toBeUndefined();
  });
});