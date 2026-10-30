"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { INQUIRY_STATUS } from "@/lib/status";
import type { AdminInquiry } from "../inquiries-admin-list";

export function InquiryAdminPricing(props: { inquiry: AdminInquiry }) {
  const router = useRouter();
  const { inquiry } = props;

  const [items, setItems] = useState(
    inquiry.items.map((i) => ({
      id: i.id,
      partName: i.partName,
      brand: i.brand,
      model: i.model,
      sku: i.sku,
      qty: i.qty,
      unit: i.unit,
      targetPrice: i.targetPrice,
      quotedUnitPrice: i.quotedUnitPrice ? String(i.quotedUnitPrice) : "",
      adminNote: "",
    })),
  );

  const [adminNote, setAdminNote] = useState(inquiry.adminNote || "");
  const [status, setStatus] = useState(inquiry.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateItemPrice = (id: string, priceStr: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quotedUnitPrice: priceStr } : it)),
    );
  };

  const updateItemNote = (id: string, note: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, adminNote: note } : it)),
    );
  };

  const totalCalculated = items.reduce((acc, it) => {
    const p = Number(it.quotedUnitPrice.replace(/[^\d]/g, "")) || 0;
    return acc + p * it.qty;
  }, 0);

  async function savePricing(newStatus?: "ANSWERED" | "REJECTED") {
    setBusy(true);
    setError(null);
    setSuccess(null);

    const st = newStatus || (totalCalculated > 0 ? "ANSWERED" : status);

    try {
      const payload = {
        adminNote: adminNote.trim() || undefined,
        status: st,
        items: items.map((i) => ({
          id: i.id,
          quotedUnitPrice: Number(i.quotedUnitPrice.replace(/[^\d]/g, "")) || 0,
          adminNote: i.adminNote.trim() || undefined,
        })),
      };

      const res = await fetch(`/api/admin/inquiries/${inquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "خطا در ذخیره‌سازی اطلاعات");
        setBusy(false);
        return;
      }

      setSuccess("قیمت‌گذاری و وضعیت استعلام با موفقیت ثبت شد.");
      setStatus(st);
      router.refresh();
    } catch {
      setError("خطا در برقراری ارتباط با سرور");
    } finally {
      setBusy(false);
    }
  }

  const currentSt = INQUIRY_STATUS[status] ?? INQUIRY_STATUS.PENDING;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-20">
      <div className="flex items-center justify-between pb-4 border-b border-rule">
        <div>
          <Link href="/admin/inquiries" className="text-xs text-brass hover:underline flex items-center gap-1 mb-1">
            <span>←</span>
            <span>بازگشت به فهرست استعلام‌ها</span>
          </Link>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>بررسی و قیمت‌گذاری استعلام:</span>
            <span className="nums text-brass">{inquiry.number}</span>
          </h1>
          <p className="text-xs text-ink-soft mt-0.5">ثبت‌شده در تاریخ {faDate(inquiry.createdAt)}</p>
        </div>

        <span
          className={`stamp text-xs ${
            currentSt.tone === "green"
              ? "text-ledger-green"
              : currentSt.tone === "red"
              ? "text-alarm"
              : currentSt.tone === "ink"
              ? "text-ink"
              : "text-brass"
          }`}
        >
          {currentSt.label}
        </span>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-alarm-soft border border-alarm/30 rounded text-alarm text-xs">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-ledger-green/10 border border-ledger-green/30 rounded text-ledger-green text-xs font-semibold">
          {success}
        </div>
      )}

      {/* مشخصات مشتری */}
      <div className="mt-4 card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-paper-raised">
        <div>
          <span className="label block">مشتری / شرکت:</span>
          <span className="font-bold text-sm mt-0.5 block">{inquiry.customer.companyName}</span>
        </div>
        <div>
          <span className="label block">شخص رابط:</span>
          <span className="font-medium text-ink mt-0.5 block">{inquiry.customer.contactName}</span>
        </div>
        <div>
          <span className="label block">تلفن تماس:</span>
          <span className="font-mono text-ink mt-0.5 block" dir="ltr">
            {inquiry.customer.phone}
          </span>
        </div>
      </div>

      {inquiry.customerNote && (
        <div className="mt-3 card p-3 text-xs bg-paper">
          <span className="label block mb-1">یادداشت مشتری:</span>
          <p className="text-ink font-medium leading-5">{inquiry.customerNote}</p>
        </div>
      )}

      {/* جدول قیمت‌گذاری اقلام */}
      <div className="mt-6 card overflow-hidden">
        <div className="p-3 bg-brass-soft/40 border-b border-rule flex items-center justify-between">
          <h2 className="text-xs font-bold">اقلام استعلام و ثبت نرخ واحد</h2>
          <span className="nums text-[11px] text-ink-soft">
            {toFaDigits(items.length)} قلم کالا
          </span>
        </div>

        <div className="divide-y divide-rule/60 p-2 sm:p-4 space-y-4">
          {items.map((it, idx) => {
            const unitPrice = Number(it.quotedUnitPrice.replace(/[^\d]/g, "")) || 0;
            const lineTotal = unitPrice * it.qty;

            return (
              <div key={it.id} className="pt-3 first:pt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brass nums">
                    ردیف {toFaDigits(idx + 1)}: {it.partName}
                  </span>
                  <div className="text-xs text-ink-soft flex gap-2">
                    {it.brand && <span>برند: {it.brand}</span>}
                    {it.model && <span>مدل: {it.model}</span>}
                    {it.sku && <span className="nums font-mono">({it.sku})</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_1.5fr] gap-3 items-end">
                  <div className="text-xs">
                    <span className="label block mb-1">تعداد و واحد درخواستی:</span>
                    <span className="nums font-bold">
                      {toFaDigits(it.qty)} {it.unit}
                    </span>
                    {it.targetPrice && (
                      <span className="block text-[11px] text-ink-soft mt-0.5 nums">
                        قیمت مدنظر مشتری: {formatToman(it.targetPrice)} ت
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="label block mb-1">قیمت واحد کارشناس (تومان) *</label>
                    <input
                      type="text"
                      value={it.quotedUnitPrice}
                      onChange={(e) => updateItemPrice(it.id, e.target.value)}
                      placeholder="مبلغ به تومان..."
                      className="input text-xs nums font-bold text-brass"
                    />
                  </div>

                  <div>
                    <span className="label block mb-1">جمع این ردیف:</span>
                    <div className="h-[38px] flex items-center px-3 bg-paper border border-rule rounded text-xs font-bold nums">
                      {lineTotal > 0 ? `${formatToman(lineTotal)} تومان` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* مجموع مبالغ */}
        <div className="p-4 bg-paper-raised border-t border-rule flex items-center justify-between text-xs">
          <span className="font-bold">مجموع کل مبلغ پیشنهادی استعلام:</span>
          <span className="nums font-bold text-base text-brass">
            {formatToman(totalCalculated)} تومان
          </span>
        </div>
      </div>

      {/* یادداشت ادمین و دکمه‌های اقدام */}
      <div className="mt-4 card p-4 space-y-4">
        <div>
          <label className="label block mb-1">یادداشت کارشناس برای مشتری (توضیح زمان بارگیری، شرایط و...):</label>
          <textarea
            rows={2}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="مثلاً: لنت‌ها ساخت کره هستند و تحویل باربری فردا صبح انجام خواهد شد..."
            className="input text-xs"
          />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-rule">
          <button
            type="button"
            onClick={() => savePricing("REJECTED")}
            disabled={busy}
            className="btn btn-ghost text-xs text-alarm border-alarm/30 hover:bg-alarm-soft/30 px-3 py-2"
          >
            رد استعلام (عدم امکان تأمین)
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => savePricing("ANSWERED")}
              disabled={busy || totalCalculated === 0}
              className="btn btn-brass text-xs px-5 py-2 font-bold"
            >
              {busy ? "در حال ذخیره..." : "ثبت و ارسال قیمت به مشتری"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
