import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";

import { money } from "@/lib/format";
import type { InvoiceSettlement } from "@/lib/types";

import { PaymentRecomposeDialog } from "./payment-recompose-dialog";

/*
 * jsdom دو API مرورگر را ندارد که radix هنگام بازشدنِ دیالوگ صدا می‌زند.
 * نبودشان ایرادِ کامپوننت نیست، کمبودِ محیط تست است.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const api = vi.hoisted(() => ({
  getInvoiceSettlement: vi.fn(),
  recomposeInvoicePayments: vi.fn(),
  searchCustomers: vi.fn(async () => []),
  createCustomer: vi.fn(),
  getActiveCustomerCategories: vi.fn(async () => []),
}));

vi.mock("@/lib/api", () => ({
  getInvoiceSettlement: api.getInvoiceSettlement,
  recomposeInvoicePayments: api.recomposeInvoicePayments,
  searchCustomers: api.searchCustomers,
  createCustomer: api.createCustomer,
  getActiveCustomerCategories: api.getActiveCustomerCategories,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** فاکتورِ ۱۰۰ میلیونی که همه‌اش کارتخوان زده شده — سناریوی خودِ کاربر. */
function settlement(over: Partial<InvoiceSettlement> = {}): InvoiceSettlement {
  return {
    invoice: {
      id: "inv-1",
      number: 1001,
      status: "CONFIRMED",
      total: 100_000_000,
      paidAmount: 100_000_000,
      dueAmount: 0,
      dueDate: null,
      customerId: "c1",
      customer: { id: "c1", firstName: "رضا", lastName: "کریمی", fullName: "رضا کریمی" },
    },
    payments: [],
    byMethod: [
      { method: "CASH", amount: 0 },
      { method: "CARD", amount: 100_000_000 },
      { method: "CREDIT", amount: 0 },
    ],
    received: 100_000_000,
    credit: 0,
    canRecompose: true,
    blockedReason: null,
    needsCustomer: false,
    editableMethods: ["CASH", "CARD", "CREDIT"],
    ...over,
  };
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof PaymentRecomposeDialog>> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PaymentRecomposeDialog
        open
        invoiceId="inv-1"
        customer={null}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("PaymentRecomposeDialog", () => {
  it("از تقسیمِ فعلیِ خودِ فاکتور شروع می‌کند، نه از صفر", async () => {
    api.getInvoiceSettlement.mockResolvedValue(settlement());
    renderDialog();

    await screen.findByLabelText("کارتخوان");
    expect(input("کارتخوان").value).toBe(money(100_000_000));
    expect(input("نقد").value).toBe("");

    // چیزی عوض نشده ⇒ ثبت خاموش است؛ با شروع از صفر این‌جا روشن می‌شد.
    const submit = screen.getByRole("button", { name: /چیزی عوض نشده/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("نسیه از باقی‌مانده حساب می‌شود و همان تقسیم ثبت می‌شود", async () => {
    api.getInvoiceSettlement.mockResolvedValue(settlement());
    api.recomposeInvoicePayments.mockResolvedValue(
      settlement({
        invoice: {
          id: "inv-1",
          number: 1001,
          status: "CONFIRMED",
          total: 100_000_000,
          paidAmount: 30_000_000,
          dueAmount: 70_000_000,
          dueDate: null,
          customerId: "c1",
          customer: { id: "c1", firstName: "رضا", lastName: "کریمی", fullName: "رضا کریمی" },
        },
      }),
    );
    renderDialog();

    await screen.findByLabelText("کارتخوان");
    // کارتخوان ۱۰۰م برداشته می‌شود و ۳۰م نقد می‌ماند؛ ۷۰م روی حساب.
    fireEvent.change(input("کارتخوان"), { target: { value: "" } });
    fireEvent.change(input("نقد"), { target: { value: "30000000" } });

    const submit = screen.getByRole("button", {
      name: new RegExp(money(70_000_000)),
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() =>
      expect(api.recomposeInvoicePayments).toHaveBeenCalledTimes(1),
    );
    const [invoiceId, dto] = api.recomposeInvoicePayments.mock.calls[0];
    expect(invoiceId).toBe("inv-1");
    expect(dto.payments).toEqual([
      { method: "CASH", amount: 30_000_000 },
      { method: "CREDIT", amount: 70_000_000 },
    ]);
  });

  it("فاکتورِ بدونِ مشتری که نسیه می‌خواهد، خودِ پنل انتخابگرِ مشتری را باز می‌کند", async () => {
    api.getInvoiceSettlement.mockResolvedValue(
      settlement({
        invoice: {
          id: "inv-1",
          number: 1001,
          status: "CONFIRMED",
          total: 100_000_000,
          paidAmount: 100_000_000,
          dueAmount: 0,
          dueDate: null,
          customerId: null,
          customer: null,
        },
        needsCustomer: true,
      }),
    );
    renderDialog();

    await screen.findByLabelText("کارتخوان");
    fireEvent.change(input("کارتخوان"), { target: { value: "" } });
    fireEvent.change(input("نقد"), { target: { value: "10000000" } });

    fireEvent.click(screen.getByRole("button", { name: /انتخاب مشتری/ }));
    expect(
      await screen.findByPlaceholderText(/نام، نام خانوادگی یا شماره تماس/),
    ).toBeTruthy();
  });

  it("وقتی بیرونِ پنل انتخابگرِ مشتری هست (صندوق)، همان صدا زده می‌شود", async () => {
    api.getInvoiceSettlement.mockResolvedValue(
      settlement({
        invoice: {
          id: "inv-1",
          number: 1001,
          status: "CONFIRMED",
          total: 100_000_000,
          paidAmount: 100_000_000,
          dueAmount: 0,
          dueDate: null,
          customerId: null,
          customer: null,
        },
        needsCustomer: true,
      }),
    );
    const onPickCustomer = vi.fn();
    renderDialog({ onPickCustomer });

    await screen.findByLabelText("کارتخوان");
    fireEvent.change(input("کارتخوان"), { target: { value: "" } });
    fireEvent.change(input("نقد"), { target: { value: "10000000" } });

    fireEvent.click(screen.getByRole("button", { name: /انتخاب مشتری/ }));
    expect(onPickCustomer).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/نام، نام خانوادگی یا شماره تماس/)).toBeNull();
  });

  it("دلیلِ خاموشی را به‌جای فرم نشان می‌دهد", async () => {
    api.getInvoiceSettlement.mockResolvedValue(
      settlement({
        canRecompose: false,
        blockedReason: "این فاکتور با چک پرداخت شده — چک مسیر خودش را دارد",
      }),
    );
    renderDialog();

    expect(await screen.findByText(/چک مسیر خودش را دارد/)).toBeTruthy();
    expect(screen.queryByLabelText("نقد")).toBeNull();
  });
});
