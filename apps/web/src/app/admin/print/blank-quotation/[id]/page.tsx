"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getBlankQuotation } from "@/lib/api";
import type { PaperSize } from "../../_components/print-styles";
import { BlankQuotationSheet } from "../../_components/blank-quotation-sheet";

/**
 * چاپ برگه‌ی سفید — قرینه‌ی صفحه‌ی چاپ پیش‌فاکتور.
 *
 * مثل بقیه‌ی برگه‌های چاپی، اندازه‌ی کاغذ انتخابی است و چاپ خودکار اجرا نمی‌شود.
 */
export default function BlankQuotationPrintPage({
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

  const blank = useQuery({
    queryKey: ["blank-quotation-print", id],
    queryFn: () => getBlankQuotation(id),
  });

  if (blank.isLoading) return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (blank.isError || !blank.data) return <p className="p-6 text-sm">برگه پیدا نشد.</p>;

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

      <BlankQuotationSheet quotation={blank.data} size={size} />
    </>
  );
}
