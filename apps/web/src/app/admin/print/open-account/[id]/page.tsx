"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getOpenAccountSheet } from "@/lib/api";
import { OpenAccountSheet, type PaperSize } from "../../_components/open-account-sheet";

/**
 * چاپ صورت‌حساب کلیِ یک حساب باز.
 *
 * پیش‌فرض A4 (برخلاف فاکتورِ تک‌نوبتی که A5 است): این برگه چند نوبت خرید را
 * کنار هم دارد و روی A5 معمولاً به صفحه‌ی دوم می‌رود. `?size=a5` هم پذیرفته
 * می‌شود برای حساب‌های کوچک.
 *
 * چاپ خودکار اجرا نمی‌شود — همان دلیلِ برگه‌ی فاکتور: باز شدنِ ناگهانیِ دیالوگ
 * چاپ روی کاغذ اشتباه یعنی یک برگه دور ریختن.
 */
export default function OpenAccountPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [size, setSize] = useState<PaperSize>("a4");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("size");
    if (q === "a4" || q === "a5") setSize(q);
  }, []);

  const sheet = useQuery({
    queryKey: ["open-account-sheet", id],
    queryFn: () => getOpenAccountSheet(id),
  });

  if (sheet.isLoading) return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (sheet.isError || !sheet.data)
    return <p className="p-6 text-sm">حساب پیدا نشد.</p>;

  return (
    <>
      <div className="no-print flex items-center gap-2 border-b bg-white px-4 py-2.5 text-sm">
        <span className="text-slate-600">اندازه‌ی کاغذ:</span>
        {(["a4", "a5"] as const).map((s) => (
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

      <OpenAccountSheet sheet={sheet.data} size={size} />
    </>
  );
}
