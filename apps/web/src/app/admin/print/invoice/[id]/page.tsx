"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCustomerFullStatement, getInvoice } from "@/lib/api";
import { isDesktop } from "@/lib/desktop";
import type { CustomerFullStatement } from "@/lib/types";

import { InvoiceSheet } from "../../_components/invoice-sheet";
import { ThermalReceipt } from "../../_components/thermal-receipt";

type Size = "a5" | "a4" | "thermal";

/** تیک‌های بخش «حساب مشتری» — همه پیش‌فرض خاموش. */
type Extras = {
  showBalance: boolean;
  showPurchaseHistory: boolean;
  showTrust: boolean;
  showDueInvoices: boolean;
};

const EMPTY_EXTRAS: Extras = {
  showBalance: false,
  showPurchaseHistory: false,
  showTrust: false,
  showDueInvoices: false,
};

const EXTRAS_LABELS: { key: keyof Extras; label: string }[] = [
  { key: "showBalance", label: "مانده کل حساب" },
  { key: "showPurchaseHistory", label: "خریدهای قبلی" },
  { key: "showTrust", label: "سابقه خوش‌حسابی" },
  { key: "showDueInvoices", label: "سررسید فاکتورهای باز" },
];

/**
 * چاپ فاکتور فروش.
 *
 * انتخاب کاغذ روی صفحه است و هنگام چاپ پنهان می‌شود. پیش‌فرض A5 چون فاکتور
 * خرده‌فروشی معمولاً همان است؛ `?size=a4` هم پذیرفته می‌شود تا بشود مستقیم روی
 * A4 باز کرد.
 *
 * گزینه‌های «حساب مشتری» (مانده، خریدهای قبلی، خوش‌حسابی، سررسید بازها) تیک‌
 * دارند و فقط وقتی یکی روشن شود صورت‌حسابِ مشتری از سرور گرفته می‌شود.
 *
 * چاپ خودکار اجرا **نمی‌شود**: فروشنده باید اول اندازه را ببیند.
 */
export default function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [size, setSize] = useState<Size>(() => {
    if (typeof window === "undefined") return "a5";
    const q = new URLSearchParams(window.location.search).get("size");
    return q === "a4" || q === "a5" || q === "thermal" ? q : "a5";
  });
  const [extras, setExtras] = useState<Extras>(EMPTY_EXTRAS);

  const invoice = useQuery({
    queryKey: ["invoice-print", id],
    queryFn: () => getInvoice(id),
  });

  const customerId = invoice.data?.customer?.id ?? null;
  const anyExtra = Object.values(extras).some(Boolean);

  const statement = useQuery({
    queryKey: ["customer-statement-print", customerId],
    queryFn: () => getCustomerFullStatement(customerId!),
    enabled: !!customerId && anyExtra,
    staleTime: 30_000,
  });

  if (invoice.isLoading)
    return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (invoice.isError || !invoice.data)
    return <p className="p-6 text-sm">فاکتور پیدا نشد.</p>;

  const thermal = size === "thermal";
  const hasCustomer = !!invoice.data.customer;

  const statementData: CustomerFullStatement | null =
    hasCustomer && anyExtra && statement.data ? statement.data : null;

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5 text-sm">
        <span className="text-slate-600">اندازه‌ی کاغذ:</span>
        {(["a5", "a4", "thermal"] as const)
          .filter((s) => s !== "thermal" || isDesktop())
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`rounded-md border px-3 py-1 ${
                size === s
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              {s === "thermal" ? "فیش ۸۰mm" : s.toUpperCase()}
            </button>
          ))}

        {hasCustomer && (
          <>
            <span className="ms-2 text-slate-400">|</span>
            <span className="text-slate-600">حساب مشتری:</span>
            {EXTRAS_LABELS.map(({ key, label }) => (
              <label
                key={key}
                className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={extras[key]}
                  onChange={(e) =>
                    setExtras((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="size-4 accent-blue-600"
                />
                {label}
              </label>
            ))}
            {anyExtra && statement.isFetching && (
              <span className="text-xs text-slate-500">
                در حال بارگذاری حساب…
              </span>
            )}
          </>
        )}

        {!thermal && (
          <button
            type="button"
            onClick={() => window.print()}
            className="ms-auto rounded-md bg-blue-600 px-4 py-1.5 text-white"
          >
            چاپ
          </button>
        )}
      </div>

      {thermal ? (
        <ThermalReceipt invoice={invoice.data} />
      ) : (
        <InvoiceSheet
          invoice={invoice.data}
          size={size}
          showBalance={extras.showBalance}
          showPurchaseHistory={extras.showPurchaseHistory}
          showTrust={extras.showTrust}
          showDueInvoices={extras.showDueInvoices}
          statement={statementData}
        />
      )}
    </>
  );
}
