"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getInvoice } from "@/lib/api";
import { isDesktop } from "@/lib/desktop";

import { InvoiceSheet } from "../../_components/invoice-sheet";
import { ThermalReceipt } from "../../_components/thermal-receipt";

type Size = "a5" | "a4" | "thermal";

/**
 * چاپ فاکتور فروش.
 *
 * انتخاب کاغذ روی صفحه است و هنگام چاپ پنهان می‌شود. پیش‌فرض A5 چون فاکتور
 * خرده‌فروشی معمولاً همان است؛ `?size=a4` هم پذیرفته می‌شود تا بشود مستقیم روی
 * A4 باز کرد.
 *
 * گزینه‌ی «فیش ۸۰mm» فقط داخل قابِ ویندوزی (Tauri) ظاهر می‌شود — چاپِ خامِ
 * ESC/POS به پرینتر حرارتی، بدون دیالوگ. در مرورگرِ معمولی نه بومی برای
 * پیش‌نمایشِ فیش معنا دارد نه پرینترِ خام در دسترس است.
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
  /*
   * پیش‌فرض A5؛ `?size=a4|thermal` هم پذیرفته می‌شود. همان‌قدری که یک effect
   * کاری را یک بار پس از اولین رندر انجام می‌دهد، lazy-initializer انجامش
   * می‌دهد — با یک رندرِ کمتر و بدون setStateِ درونِ effect. (در حین SSR
   * مرورگر نیست، پس به مقدارِ پیش‌فرض «a5» برمی‌گردد.)
   */
  const [size, setSize] = useState<Size>(() => {
    if (typeof window === "undefined") return "a5";
    const q = new URLSearchParams(window.location.search).get("size");
    return q === "a4" || q === "a5" || q === "thermal" ? q : "a5";
  });

  const invoice = useQuery({
    queryKey: ["invoice-print", id],
    queryFn: () => getInvoice(id),
  });

  if (invoice.isLoading) return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (invoice.isError || !invoice.data)
    return <p className="p-6 text-sm">فاکتور پیدا نشد.</p>;

  const thermal = size === "thermal";

  return (
    <>
      <div className="no-print flex items-center gap-2 border-b bg-white px-4 py-2.5 text-sm">
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
        <InvoiceSheet invoice={invoice.data} size={size} />
      )}
    </>
  );
}
