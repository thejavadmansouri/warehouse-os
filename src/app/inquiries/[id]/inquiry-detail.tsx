"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { INQUIRY_STATUS } from "@/lib/status";
import type { InquiryRecord } from "../inquiries-view";

export function InquiryDetail(props: {
  inquiry: InquiryRecord;
  shippingMethods: { id: string; name: string; cost: number; freeAbove: number | null; note: string | null }[];
}) {
  const router = useRouter();
  const { inquiry } = props;
  const [shippingId, setShippingId] = useState(props.shippingMethods[0]?.id ?? "");
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const st = INQUIRY_STATUS[inquiry.status] ?? INQUIRY_STATUS.PENDING;
  const canConvert = inquiry.status === "ANSWERED" && (inquiry.totalQuoted ?? 0) > 0;

  async function convertToOrder() {
    setConverting(true);
    setError(null);

    try {
      const res = await fetch(`/api/inquiries/${inquiry.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "تبدیل استعلام با خطا مواجه شد");
        setConverting(false);
        return;
      }

      router.push(`/orders/${data.order.id}`);
    } catch {
      setError("خطا در برقراری ارتباط با سرور");
      setConverting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24">
      <div className="flex items-center justify-between pb-4 border-b border-rule">
        <div>
          <Link href="/inquiries" className="text-xs text-brass hover:underline flex items-center gap-1 mb-1">
            <span>←</span>
            <span>بازگشت به فهرست استعلام‌ها</span>
          </Link>
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <span>استعلام شماره:</span>
            <span className="nums text-brass">{inquiry.number}</span>
          </h1>
          <p className="text-xs text-ink-soft mt-0.5">ثبت‌شده در تاریخ {faDate(inquiry.createdAt)}</p>
        </div>

        <span
          className={`stamp text-xs ${
            st.tone === "green"
              ? "text-ledger-green"
              : st.tone === "red"
              ? "text-alarm"
              : st.tone === "ink"
              ? "text-ink"
              : "text-brass"
          }`}
        >
          {st.label}
        </span>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-alarm-soft border border-alarm/30 rounded text-alarm text-xs">
          {error}
        </div>
      )}

      {inquiry.status === "CONVERTED" && inquiry.convertedOrderId && (
        <div className="mt-4 p-4 card bg-ledger-green/10 border-ledger-green/30 flex items-center justify-between flex-wrap gap-2 text-xs">
          <p className="font-bold text-ledger-green">
            این استعلام با موفقیت به پیش‌فاکتور تبدیل شده است.
          </p>
          <Link
            href={`/orders/${inquiry.convertedOrderId}`}
            className="btn btn-primary text-xs px-3 py-1.5"
          >
            مشاهده و پرداخت پیش‌فاکتور
          </Link>
        </div>
      )}

      {/* اطلاعات و یادداشت‌ها */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="card p-3">
          <span className="label block mb-1">یادداشت و درخواست شما:</span>
          <p className="text-ink font-medium leading-5">
            {inquiry.customerNote || "توضیحاتی ثبت نشده است"}
          </p>
        </div>

        <div className="card p-3 bg-paper-raised">
          <span className="label block mb-1">پاسخ و توضیحات کارشناس کاردو:</span>
          <p className="text-ink font-medium leading-5">
            {inquiry.adminNote || (inquiry.status === "PENDING" ? "در صف بررسی توسط واحد فروش..." : "—")}
          </p>
        </div>
      </div>

      {/* جدول ردیف‌های اقلام استعلام */}
      <div className="mt-6 card overflow-hidden">
        <div className="p-3 bg-brass-soft/40 border-b border-rule flex items-center justify-between">
          <h2 className="text-xs font-bold">اقلام استعلام‌شده و قیمت‌های اعلامی کاردو</h2>
          <span className="nums text-[11px] text-ink-soft">
            {toFaDigits(inquiry.items.length)} قلم کالا
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-paper border-b border-rule text-ink-soft text-[11px]">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">#</th>
                <th className="py-2.5 px-3 text-start">شرح قطعه</th>
                <th className="py-2.5 px-3 text-center">خودرو / مدل</th>
                <th className="py-2.5 px-3 text-center">کد فنی</th>
                <th className="py-2.5 px-3 text-center">تعداد</th>
                <th className="py-2.5 px-3 text-end">قیمت اعلامی واحد</th>
                <th className="py-2.5 px-3 text-end">جمع ردیف (تومان)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/50">
              {inquiry.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-paper/30">
                  <td className="py-2.5 px-3 text-center nums text-ink-soft">{toFaDigits(idx + 1)}</td>
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-xs">{item.partName}</p>
                    {item.adminNote && (
                      <p className="text-[10px] text-brass mt-0.5">توضیح انبار: {item.adminNote}</p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center text-ink-soft">
                    {item.brand || "—"} {item.model ? `(${item.model})` : ""}
                  </td>
                  <td className="py-2.5 px-3 text-center nums font-mono text-[11px] text-ink-soft">
                    {item.sku || "—"}
                  </td>
                  <td className="py-2.5 px-3 text-center nums">
                    {toFaDigits(item.qty)} {item.unit}
                  </td>
                  <td className="py-2.5 px-3 text-end nums">
                    {item.quotedUnitPrice ? (
                      formatToman(item.quotedUnitPrice)
                    ) : (
                      <span className="text-ink-soft text-[11px]">در انتظار قیمت</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-end nums font-bold">
                    {item.lineTotal ? (
                      formatToman(item.lineTotal)
                    ) : (
                      <span className="text-ink-soft font-normal">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* جمع استعلام */}
        {inquiry.totalQuoted && inquiry.totalQuoted > 0 && (
          <div className="p-3 bg-paper-raised border-t border-rule flex items-center justify-between text-xs">
            <span className="font-bold">مجموع مبلغ کل اقلام استعلام:</span>
            <span className="nums font-bold text-sm text-brass">
              {formatToman(inquiry.totalQuoted)} تومان
            </span>
          </div>
        )}
      </div>

      {/* بخش تبدیل به پیش‌فاکتور (در صورتی که قیمت‌گذاری شده باشد) */}
      {canConvert && (
        <div className="mt-6 card p-4 sm:p-5 bg-paper-raised border-2 border-brass/50 shadow-sm">
          <h3 className="font-bold text-sm text-ink">تأیید قیمت و صدور فوری پیش‌فاکتور</h3>
          <p className="text-xs text-ink-soft mt-1">
            قیمت‌ها مورد تأیید است؟ شیوه ارسال باربری را انتخاب کرده و روی «صدور پیش‌فاکتور» کلیک نمایید تا سند رسمی با رزرو کالا برایتان صادر شود.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="label block mb-1">روش ارسال پیش‌فرض کالا:</label>
              <select
                value={shippingId}
                onChange={(e) => setShippingId(e.target.value)}
                className="input text-xs"
              >
                {props.shippingMethods.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.cost > 0 ? `${formatToman(s.cost)} ت` : "پس‌کرایه"})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={convertToOrder}
              disabled={converting}
              className="btn btn-brass py-2.5 text-xs font-bold w-full"
            >
              {converting ? "در حال صدور پیش‌فاکتور..." : "صدور پیش‌فاکتور رسمی و ادامه به پرداخت"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
