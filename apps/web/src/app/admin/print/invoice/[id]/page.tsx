"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getInvoice } from "@/lib/api";
import { InvoiceSheet, type PaperSize } from "../../_components/invoice-sheet";

/**
 * چاپ فاکتور فروش.
 *
 * انتخاب کاغذ روی صفحه است و هنگام چاپ پنهان می‌شود. پیش‌فرض A5 چون فاکتور
 * خرده‌فروشی معمولاً همان است؛ `?size=a4` هم پذیرفته می‌شود تا بشود مستقیم روی
 * A4 باز کرد.
 *
 * چاپ خودکار اجرا **نمی‌شود**: فروشنده باید اول اندازه را ببیند. باز شدنِ
 * ناگهانیِ دیالوگ چاپ روی کاغذ اشتباه یعنی یک برگه دور ریختن.
 */
export default function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [size, setSize] = useState<PaperSize>("a5");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("size");
    if (q === "a4" || q === "a5") setSize(q);
  }, []);

  const invoice = useQuery({
    queryKey: ["invoice-print", id],
    queryFn: () => getInvoice(id),
  });

  if (invoice.isLoading) return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (invoice.isError || !invoice.data)
    return <p className="p-6 text-sm">فاکتور پیدا نشد.</p>;

  return (
    <>
      <div className="no-print flex items-center gap-2 border-b bg-white px-4 py-2.5 text-sm">
        <span className="text-slate-600">اندازه‌ی کاغذ:</span>
        {(["a5", "a4"] as const).map((s) => (
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
            {s.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          className="ms-auto rounded-md bg-blue-600 px-4 py-1.5 text-white"
        >
          چاپ
        </button>
      </div>

      <InvoiceSheet invoice={invoice.data} size={size} />
    </>
  );
}
