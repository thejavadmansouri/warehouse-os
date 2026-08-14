"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCustomer, getStatement } from "@/lib/api";
import { faDate, money, toFa } from "@/lib/format";
import type { LedgerEntryType } from "@/lib/types";

import { PrintStyles, type PaperSize } from "../../_components/print-styles";
import { ShopHeader, ShopPaymentInfo } from "../../_components/shop-header";

/** برچسب هر حرکت — به زبان مشتری، نه زبان حسابداری. */
const LABELS: Record<LedgerEntryType, string> = {
  OPENING: "مانده‌ی قبلی",
  INVOICE: "خرید",
  RECEIPT: "پرداخت",
  INVOICE_CANCELLED: "ابطال فاکتور",
  RETURN: "برگشت کالا",
  CHEQUE_BOUNCED: "چک برگشتی",
  ADJUSTMENT: "اصلاح حساب",
};

/**
 * صورت‌حساب مشتری.
 *
 * این همان کاغذی است که مشتری می‌خواهد ببرد: «تا حالا چه خریده‌ام، چه داده‌ام،
 * چقدر مانده». پس برخلاف فاکتور، ستون **مانده‌ی تجمعی** دارد — بدون آن، مشتری
 * باید خودش جمع بزند و اولین جایی است که سرِ عدد دعوا می‌شود.
 *
 * پیش‌فرض A4 (نه A5 مثل فاکتور)، چون گردش حساب چند ماهه روی نصف‌برگ جا نمی‌شود.
 */
export default function StatementPrintPage({
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

  const customer = useQuery({
    queryKey: ["statement-print-customer", id],
    queryFn: () => getCustomer(id),
  });
  const statement = useQuery({
    queryKey: ["statement-print", id],
    queryFn: () => getStatement(id, { limit: 200 }),
  });

  if (customer.isLoading || statement.isLoading)
    return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (customer.isError || !customer.data)
    return <p className="p-6 text-sm">مشتری پیدا نشد.</p>;

  const c = customer.data;
  const s = c.summary;

  /*
   * سرور قدیم به جدید برمی‌گرداند و مانده‌ی متحرک را همین‌جا حساب می‌کند —
   * صورت‌حساب همان ترتیب را چاپ می‌کند و جمع‌ها از خلاصه‌ی سرور می‌آید (نه فقط
   * ۲۰۰ ردیفِ این صفحه).
   */
  const rows = statement.data?.rows.data ?? [];

  /** جمع آنچه پرداخته — همه‌ی حرکت‌هایی که بدهی را کم کرده‌اند. */
  const paid = statement.data?.summary.totalCredit ?? 0;
  const charged = statement.data?.summary.totalDebit ?? 0;

  return (
    <>
      <div className="no-print flex items-center gap-2 border-b bg-white px-4 py-2.5 text-sm">
        <span className="text-slate-600">اندازه‌ی کاغذ:</span>
        {(["a4", "a5"] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setSize(x)}
            className={`rounded-md border px-3 py-1 ${
              size === x
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-300 text-slate-700"
            }`}
          >
            {x.toUpperCase()}
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

      <div className={`sheet ${size}`} dir="rtl">
        <header className="head">
          <div>
            <div className="title">صورت‌حساب مشتری</div>
            <ShopHeader />
          </div>
          <div className="meta">
            <div>تاریخ صدور: {faDate(new Date().toISOString())}</div>
          </div>
        </header>

        <section className="party">
          <div>
            <span className="muted">مشتری: </span>
            <b>{c.fullName}</b>
          </div>
          {!!c.phones?.[0]?.phone && (
            <div>
              <span className="muted">تلفن: </span>
              <span dir="ltr">{toFa(c.phones[0].phone)}</span>
            </div>
          )}
        </section>

        <table className="items">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>شرح</th>
              <th>بدهکار</th>
              <th>بستانکار</th>
              <th>مانده</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{faDate(e.createdAt)}</td>
                <td>
                  {LABELS[e.type]}
                  {/*
                    توضیح، شماره‌ی فاکتور/رسید و روش پرداخت را با خودش دارد —
                    همان «چطور پرداخت کرده» که مشتری می‌پرسد.
                  */}
                  {e.note && <div className="muted">{e.note}</div>}
                </td>
                <td>{e.amount > 0 ? money(e.amount) : "—"}</td>
                <td>{e.amount < 0 ? money(Math.abs(e.amount)) : "—"}</td>
                <td>{money(e.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="totals">
          <div>
            <span>جمع خرید و بدهی</span>
            <span>{money(charged)}</span>
          </div>
          <div>
            <span>جمع پرداختی</span>
            <span>− {money(paid)}</span>
          </div>
          {!!s?.overdue && (
            <div>
              <span>از این مبلغ، سررسید گذشته</span>
              <span>{money(s.overdue)}</span>
            </div>
          )}
          <div className="grand">
            <span>{(s?.totalDue ?? 0) >= 0 ? "مانده‌ی بدهی" : "بستانکار"}</span>
            <span>{money(Math.abs(s?.totalDue ?? 0))} ریال</span>
          </div>
        </section>

        {!!s?.chequesInHandCount && (
          <section className="note">
            {toFa(s.chequesInHandCount)} فقره چک دریافت شده که هنوز وصول نشده
            است. مبلغ آن از بدهی کسر شده و در صورت برگشت، دوباره به حساب اضافه
            می‌شود.
          </section>
        )}

        <ShopPaymentInfo />

        <footer className="sign">
          <div>مهر و امضای فروشنده</div>
          <div>امضای مشتری</div>
        </footer>
      </div>

      <PrintStyles size={size} />
    </>
  );
}
