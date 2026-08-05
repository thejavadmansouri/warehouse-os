"use client";

import { faDate, money, qty, toFa, PAYMENT_LABELS } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export type PaperSize = "a4" | "a5";

/**
 * برگه‌ی فاکتور برای چاپ روی A4 یا A5.
 *
 * جدا از مسیر نگه داشته شده تا بشود بدون لاگین رندرش کرد و چیدمانِ چاپ را با
 * چشم سنجید — چیزی که فقط با دیدنِ برگه معلوم می‌شود، نه از روی کد.
 *
 * بدون کتابخانه‌ی PDF: همان قرارداد چاپ لیبل، یعنی HTML + window.print() و
 * انتخاب پرینتر با دیالوگ خود ویندوز.
 */
export function InvoiceSheet({
  invoice: inv,
  size,
}: {
  invoice: Invoice;
  size: PaperSize;
}) {
  const lines = inv.lines ?? [];
  const linesGross = lines.reduce(
    (s, l) => s + Math.abs(l.quantity) * (l.unitPrice ?? 0),
    0
  );
  const storedLineDiscounts = lines.reduce((s, l) => s + (l.lineDiscount ?? 0), 0);
  /*
   * فاکتورهای پیش از افزوده‌شدن ستون تخفیفِ ردیف، مقدارشان null است. آنجا تخفیف
   * ردیفی را از اختلافِ جمع ردیف‌ها با subtotal درمی‌آوریم تا جمع‌های پایینِ برگه
   * همیشه درست بخوانند، حتی اگر نشود گفت روی کدام قلم بوده.
   */
  const lineDiscounts = storedLineDiscounts || Math.max(0, linesGross - inv.subtotal);
  const perLineKnown = storedLineDiscounts > 0;
  const cancelled = inv.status === "CANCELLED";

  return (
    <>
      <div className={`sheet ${size}`} dir="rtl">
        {cancelled && <div className="void">باطل شده</div>}

        <header className="head">
          <div>
            <div className="title">فاکتور فروش</div>
            <div className="muted">{inv.warehouse?.name ?? ""}</div>
          </div>
          <table className="meta">
            <tbody>
              <tr>
                <td className="muted">شماره</td>
                <td className="num strong">{toFa(inv.number)}</td>
              </tr>
              <tr>
                <td className="muted">تاریخ</td>
                <td className="num">{faDate(inv.createdAt)}</td>
              </tr>
            </tbody>
          </table>
        </header>

        <section className="party">
          <div>
            <span className="muted">خریدار: </span>
            <span className="strong">{inv.customer?.fullName ?? "مشتری نقدی"}</span>
          </div>
          {inv.customer?.phones?.[0]?.phone && (
            <div dir="ltr" className="num muted">
              {toFa(inv.customer.phones[0].phone)}
            </div>
          )}
          {inv.user && <div className="muted">فروشنده: {inv.user.fullName}</div>}
        </section>

        <table className="items">
          <thead>
            <tr>
              <th className="w-row">ردیف</th>
              <th>شرح کالا</th>
              <th className="w-qty">تعداد</th>
              <th className="w-price">قیمت واحد</th>
              {perLineKnown && <th className="w-price">تخفیف</th>}
              <th className="w-price">مبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const q = Math.abs(l.quantity);
              const unit = l.unitPrice ?? 0;
              const disc = l.lineDiscount ?? 0;
              return (
                <tr key={l.id ?? i}>
                  <td className="num center">{toFa(i + 1)}</td>
                  <td>
                    {l.product?.name ?? "—"}
                    {l.product?.sku && (
                      <span className="muted sku"> · کد {toFa(l.product.sku)}</span>
                    )}
                  </td>
                  <td className="num center">
                    {qty(q)} {l.product?.unit ?? ""}
                  </td>
                  <td className="num">{money(unit)}</td>
                  {perLineKnown && <td className="num">{disc ? money(disc) : "—"}</td>}
                  <td className="num strong">{money(q * unit - disc)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className="totals">
          <table>
            <tbody>
              <tr>
                <td>جمع اقلام</td>
                <td className="num">{money(linesGross)}</td>
              </tr>
              {lineDiscounts > 0 && (
                <tr>
                  <td>تخفیف اقلام</td>
                  <td className="num">− {money(lineDiscounts)}</td>
                </tr>
              )}
              {inv.discount > 0 && (
                <tr>
                  <td>تخفیف فاکتور</td>
                  <td className="num">− {money(inv.discount)}</td>
                </tr>
              )}
              <tr className="grand">
                <td>مبلغ قابل پرداخت</td>
                <td className="num">{money(inv.total)} تومان</td>
              </tr>
              {inv.dueAmount > 0 && (
                <tr className="due">
                  <td>مانده (نسیه)</td>
                  <td className="num">{money(inv.dueAmount)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {(inv.payments ?? []).length > 0 && (
          <section className="pay muted">
            نحوه‌ی پرداخت:{" "}
            {inv.payments!
              .map((p) => `${PAYMENT_LABELS[p.method] ?? p.method} ${money(p.amount)}`)
              .join(" · ")}
          </section>
        )}

        {inv.note && <section className="note">توضیح: {inv.note}</section>}

        <footer className="sign">
          <div>مهر و امضای فروشنده</div>
          <div>امضای خریدار</div>
        </footer>
      </div>

      <style jsx global>{`
        :root {
          color-scheme: light;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: #f1f5f9;
        }

        .sheet {
          position: relative;
          margin: 16px auto;
          background: #fff;
          color: #000;
          font-family: Vazirmatn, Tahoma, sans-serif;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
        }
        .sheet.a4 {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm;
          font-size: 12px;
        }
        .sheet.a5 {
          width: 148mm;
          min-height: 210mm;
          padding: 8mm;
          font-size: 10.5px;
        }

        .void {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-size: 48px;
          font-weight: 800;
          color: rgba(220, 38, 38, 0.18);
          transform: rotate(-20deg);
          pointer-events: none;
        }

        .head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 3mm;
        }
        .title {
          font-size: 1.6em;
          font-weight: 800;
        }
        .meta td {
          padding: 0 4px;
        }

        .party {
          display: flex;
          gap: 6mm;
          flex-wrap: wrap;
          padding: 3mm 0;
          border-bottom: 1px solid #cbd5e1;
        }

        .items {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
        }
        .items th,
        .items td {
          border: 1px solid #94a3b8;
          padding: 1.6mm 2mm;
          text-align: start;
          vertical-align: top;
        }
        .items th {
          background: #e2e8f0;
          font-weight: 700;
        }
        .w-row {
          width: 10mm;
        }
        .w-qty {
          width: 18mm;
        }
        .w-price {
          width: 24mm;
        }
        .sku {
          font-size: 0.85em;
        }

        .totals {
          display: flex;
          margin-top: 4mm;
        }
        .totals table {
          border-collapse: collapse;
          min-width: 70mm;
        }
        .totals td {
          padding: 1.2mm 3mm;
        }
        .grand td {
          border-top: 2px solid #000;
          font-size: 1.25em;
          font-weight: 800;
          padding-top: 2mm;
        }
        .due td {
          color: #b45309;
          font-weight: 700;
        }

        .pay,
        .note {
          margin-top: 3mm;
        }

        .sign {
          display: flex;
          justify-content: space-between;
          margin-top: 12mm;
          padding-top: 3mm;
        }
        .sign div {
          width: 45%;
          border-top: 1px dotted #64748b;
          padding-top: 2mm;
          text-align: center;
        }

        .num {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .center {
          text-align: center;
        }
        .strong {
          font-weight: 700;
        }
        .muted {
          color: #475569;
        }

        @media print {
          html,
          body {
            background: #fff;
          }
          /* هر چیزی جز خود برگه نباید روی کاغذ بیاید. */
          .no-print {
            display: none !important;
          }
          .sheet {
            margin: 0;
            box-shadow: none;
            width: auto;
            min-height: auto;
          }
          .items th {
            /* بدون این، پس‌زمینه‌ی سرستون چاپ نمی‌شود و جدول بی‌سر می‌ماند. */
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/*
        اندازه‌ی @page را نمی‌شود با متغیر CSS عوض کرد، پس برای هر اندازه یک
        قاعده‌ی جدا تزریق می‌شود. بدون این، مرورگر A4 فرض می‌کند و فاکتور A5 وسط
        یک برگ بزرگ چاپ می‌شود.
      */}
      <style jsx global>{`
        @page {
          size: ${size === "a4" ? "A4" : "A5"} portrait;
          margin: 10mm;
        }
      `}</style>
    </>
  );
}
