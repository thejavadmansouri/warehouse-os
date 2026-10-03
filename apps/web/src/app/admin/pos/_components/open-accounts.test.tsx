import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
  Customer,
  CustomerBalanceRow,
  OpenAccountDetail,
  OpenAccountSummary,
} from "@/lib/types";

import { OpenAccounts } from "./open-accounts";

/*
 * jsdom چند API مرورگر را ندارد که radix هنگام بازشدنِ دیالوگ صدا می‌زند.
 * نبودشان ایرادِ کامپوننت نیست، کمبودِ محیط تست است.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

/*
 * فقط چند خواندنِ همان پنل جایگزین می‌شود؛ بقیه‌ی api دست‌نخورده می‌ماند تا
 * دیالوگ‌های فرزند (مرجوعی/اصلاح/پرداخت) با همان قراردادِ واقعی ایمپورت شوند.
 */
const api = vi.hoisted(() => ({
  getCustomerBalances: vi.fn(),
  listOpenAccounts: vi.fn(),
  getOpenAccount: vi.fn(),
  getCustomer: vi.fn(),
  getInvoiceSettlement: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCustomerBalances: api.getCustomerBalances,
  listOpenAccounts: api.listOpenAccounts,
  getOpenAccount: api.getOpenAccount,
  getCustomer: api.getCustomer,
  getInvoiceSettlement: api.getInvoiceSettlement,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATE = "2026-09-11T08:00:00.000Z";

const balanceRow: CustomerBalanceRow = {
  id: "c1",
  fullName: "رضا کریمی",
  phone: "09120000000",
  balance: 100_000_000,
  kind: "debtor",
  current: 100_000_000,
  dueToday: 0,
  overdue: 0,
  nextDueDate: null,
  invoiceCount: 1,
};

const account: OpenAccountSummary = {
  id: "acc1",
  number: 5,
  customerId: "c1",
  customerName: "رضا کریمی",
  phone: "09120000000",
  status: "OPEN",
  total: 100_000_000,
  invoiceCount: 1,
  firstVisit: DATE,
  lastVisit: DATE,
  createdAt: DATE,
};

const detail: OpenAccountDetail = {
  id: "acc1",
  number: 5,
  customerId: "c1",
  customerName: "رضا کریمی",
  phone: "09120000000",
  status: "OPEN",
  note: null,
  settledAt: null,
  createdAt: DATE,
  total: 100_000_000,
  grossTotal: 100_000_000,
  invoiceCount: 1,
  invoices: [
    {
      id: "inv-1",
      number: 1001,
      total: 100_000_000,
      netTotal: 100_000_000,
      discount: 0,
      note: null,
      createdAt: DATE,
      lines: [
        {
          id: "l1",
          saleLogId: "sl1",
          invoiceId: "inv-1",
          invoiceNumber: 1001,
          productId: "pr1",
          productName: "لنت جلو پراید",
          unit: "عدد",
          quantity: 10,
          returnedQuantity: 0,
          correctedQuantity: 0,
          effectiveQuantity: 10,
          unitPrice: 10_000_000,
          originalUnitPrice: 10_000_000,
          discount: 0,
          createdAt: DATE,
        },
      ],
    },
  ],
};

const customer: Customer = {
  id: "c1",
  firstName: "رضا",
  lastName: "کریمی",
  fullName: "رضا کریمی",
  phones: [],
} as unknown as Customer;

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.getCustomerBalances.mockResolvedValue([balanceRow]);
  api.listOpenAccounts.mockResolvedValue([account]);
  api.getOpenAccount.mockResolvedValue(detail);
  api.getCustomer.mockResolvedValue(customer);
  api.getInvoiceSettlement.mockResolvedValue({
    invoice: {
      id: "inv-1",
      number: 1001,
      status: "OPEN",
      total: 100_000_000,
      paidAmount: 0,
      dueAmount: 100_000_000,
      dueDate: null,
      customerId: "c1",
      customer: { id: "c1", firstName: "رضا", lastName: "کریمی", fullName: "رضا کریمی" },
    },
    payments: [],
    byMethod: [
      { method: "CASH", amount: 0 },
      { method: "CARD", amount: 0 },
      { method: "CREDIT", amount: 0 },
    ],
    received: 0,
    credit: 0,
    canRecompose: true,
    blockedReason: null,
    needsCustomer: false,
    editableMethods: ["CASH", "CARD", "CREDIT"],
  });

  return render(
    <QueryClientProvider client={client}>
      <OpenAccounts open onContinue={vi.fn()} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("حساب‌بازها — اصلاح نحوهٔ پرداخت", () => {
  it("از پروندهٔ حساب، پنلِ اصلاحِ تقسیمِ پرداخت باز می‌شود", async () => {
    renderPanel();

    // ردیفِ فهرست ← پروندهٔ حساب ← دکمهٔ «نحوهٔ پرداخت» روی همان نوبت.
    fireEvent.click(await screen.findByRole("button", { name: /رضا کریمی/ }));
    fireEvent.click(await screen.findByRole("button", { name: /نحوهٔ پرداخت/ }));

    expect(
      await screen.findByText(/اصلاح نحوهٔ پرداخت — فاکتور/),
    ).toBeTruthy();
    expect(api.getInvoiceSettlement).toHaveBeenCalledWith("inv-1");
  });
});
