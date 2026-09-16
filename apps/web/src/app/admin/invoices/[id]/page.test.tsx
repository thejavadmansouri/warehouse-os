import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Invoice, InvoiceSettlement } from "@/lib/types";

import InvoiceDetailPage from "./page";

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

/* صفحه از پارامترِ مسیر شناسهٔ فاکتور را می‌خواند. */
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "inv-1" }),
}));

/*
 * فقط همان چند خواندنِ مربوط به این تست جایگزین می‌شود؛ بقیه‌ی api دست‌نخورده
 * می‌ماند تا پنلِ اصلاحِ پرداخت با همان قراردادِ واقعی ایمپورت شود.
 */
const api = vi.hoisted(() => ({
  getInvoice: vi.fn(),
  getReturns: vi.fn(),
  getCorrections: vi.fn(),
  getReturnableLines: vi.fn(),
  getVouchersByInvoice: vi.fn(),
  getInvoiceSettlement: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getInvoice: api.getInvoice,
  getReturns: api.getReturns,
  getCorrections: api.getCorrections,
  getReturnableLines: api.getReturnableLines,
  getVouchersByInvoice: api.getVouchersByInvoice,
  getInvoiceSettlement: api.getInvoiceSettlement,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATE = "2026-09-11T08:00:00.000Z";

const invoice: Invoice = {
  id: "inv-1",
  number: 1001,
  subtotal: 100_000_000,
  discount: 0,
  total: 100_000_000,
  paidAmount: 100_000_000,
  dueAmount: 0,
  status: "CONFIRMED",
  note: null,
  cancelReason: null,
  createdAt: DATE,
  customer: null,
  user: { id: "u1", fullName: "فروشنده" },
  payments: [
    { id: "p1", method: "CARD", amount: 100_000_000, note: null, cheque: null },
  ],
  lines: [
    {
      id: "l1",
      quantity: 10,
      unitPrice: 10_000_000,
      lineDiscount: 0,
      lineNote: null,
      product: { id: "pr1", name: "لنت جلو پراید", sku: "1234", unit: "عدد" },
      location: { id: "loc1", name: "قفسه ۱", code: "A1", path: "A1" },
    },
  ],
};

const settlement: InvoiceSettlement = {
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
};

function renderPage(over: Partial<InvoiceSettlement> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.getInvoice.mockResolvedValue(invoice);
  api.getReturns.mockResolvedValue({ data: [], meta: {} });
  api.getCorrections.mockResolvedValue({ data: [], meta: {} });
  api.getReturnableLines.mockResolvedValue({ lines: [] });
  api.getVouchersByInvoice.mockResolvedValue([]);
  api.getInvoiceSettlement.mockResolvedValue({ ...settlement, ...over });

  return render(
    <QueryClientProvider client={client}>
      <InvoiceDetailPage />
    </QueryClientProvider>,
  );
}

describe("صفحهٔ جزئیات فاکتور — اصلاح نحوهٔ پرداخت", () => {
  it("دکمه روی کارتِ پرداخت‌ها هست و پنلِ اصلاح را باز می‌کند", async () => {
    renderPage();

    const button = await screen.findByRole("button", {
      name: /اصلاح نحوهٔ پرداخت/,
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(button);
    expect(await screen.findByText(/— فاکتور ۱۰۰۱/)).toBeTruthy();
    expect(api.getInvoiceSettlement).toHaveBeenCalledWith("inv-1");
  });

  it("وقتی فاکتور قابلِ اصلاح نیست، دکمه خاموش است و دلیلش را در title دارد", async () => {
    renderPage({
      canRecompose: false,
      blockedReason: "این فاکتور با چک پرداخت شده — چک مسیر خودش را دارد",
    });

    const button = await screen.findByRole("button", {
      name: /اصلاح نحوهٔ پرداخت/,
    });
    await expect.poll(() => (button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toMatch(/چک/);
  });
});
