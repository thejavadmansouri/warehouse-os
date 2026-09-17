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
  const [showLinkedName, setShowLinkedName] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paper = params.get("size");
    // URL query parameters are external input; sync them once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (paper === "a4" || paper === "a5") setSize(paper);
    if (params.get("showLinkedName") === "0") setShowLinkedName(false);
  }, []);

  const blank = useQuery({
    queryKey: ["blank-quotation-print", id],
    queryFn: () => getBlankQuotation(id),
  });

  if (blank.isLoading) return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (blank.isError || !blank.data)
    return <p className="p-6 text-sm">برگه پیدا نشد.</p>;

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
        <label className="ms-2 inline-flex cursor-pointer items-center gap-2 text-slate-700">
          <input
            type="checkbox"
            checked={showLinkedName}
            onChange={(e) => setShowLinkedName(e.target.checked)}
            className="size-4 accent-blue-600"
          />
          نمایش نام کالای وصل‌شده
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="ms-auto rounded-md bg-blue-600 px-4 py-1.5 text-white"
        >
          چاپ
        </button>
      </div>

      <BlankQuotationSheet
        quotation={blank.data}
        size={size}
        showLinkedName={showLinkedName}
      />
    </>
  );
}
