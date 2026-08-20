"use client";

import { faDate, money, qty, toFa } from "@/lib/format";
import type { Quotation } from "@/lib/types";

import { PrintStyles, type PaperSize } from "./print-styles";
import { ShopHeader, ShopPaymentInfo } from "./shop-header";

/**
 * برگه‌ی چاپ پیش‌فاکتور.
 *
 * همان قالبِ فاکتور فروش را دارد (استایل مشترک است) با سه تفاوتِ عمدی:
 *
 *  ۱) عنوان «پیش‌فاکتور» است، نه «فاکتور فروش». مشتری این برگه را می‌برد و
 *     نباید با فاکتور واقعی اشتباه بگیرد.
 *  ۲) تاریخ اعتبار درشت نوشته می‌شود — همان چیزی که کل معنای این کاغذ است:
 *     این قیمت تا کِی معتبر می‌ماند.
 *  ۳) هیچ ردیف پرداختی ندارد، چون پیش‌فاکتور پولی جابه‌جا نکرده و موجودی هم
 *     کم نکرده.
 */
export function QuotationSheet({
  quotation: q,
  size,
}: {
  quotation: Quotation;
  size: PaperSize;
}) {
  const lines = q.lines ?? [];
  const linesGross = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const lineDiscounts = lines.reduce((s, l) => s + (l.discount ?? 0), 0);

  const expired = q.isExpired || q.displayStatus === "EXPIRED";
  const cancelled = q.displayStatus === "CANCELLED";

  return (
    <>
      <div className={`sheet ${size}`} dir="rtl">
        {/* مهرِ اریب، همان جایی که فاکتورِ باطل «باطل شده» می‌خورد. */}
        {cancelled && <div className="void">باطل شده</div>}
        {!cancelled && expired && <div className="void">منقضی شده</div>}

        <header className="head">
          <div>
            <div className="title">پیش‌فاکتور</div>
            <ShopHeader />
            <div className="muted">سند فروش نیست — فقط اعلام قیمت</div>
          </div>
          <div className="meta">
            <div>
              شماره: <b>{toFa(q.number)}</b>
            </div>
            <div>تاریخ: {faDate(q.createdAt)}</div>
            {q.user?.fullName && <div>فروشنده: {q.user.fullName}</div>}
          </div>
        </header>

        <section className="party">
          <div>
            <span className="muted">مشتری: </span>
            <b>{q.customerName ?? "—"}</b>
          </div>
          {/*
            اعتبار درشت‌ترین چیزِ بالای برگه بعد از شماره است. مشتری با همین
            کاغذ برمی‌گردد و می‌گوید «قیمت این بود» — تاریخش باید انکارناپذیر
            روی کاغذ باشد.
          */}
          <div>
            <span className="muted">معتبر تا: </span>
            <b>{faDate(q.validUntil)}</b>
          </div>
        </section>

        <table className="items">
          <thead>
            <tr>
              <th>#</th>
              <th>کالا</th>
              <th>تعداد</th>
              <th>قیمت واحد</th>
              <th>تخفیف</th>
              <th>جمع</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td>{toFa(i + 1)}</td>
                <td>
                  {l.product.name}
                  {l.product.sku && (
                    <div className="muted">کد {toFa(l.product.sku)}</div>
                  )}
                </td>
                <td>
                  {qty(l.quantity)} {l.product.unit ?? ""}
                </td>
                <td>{money(l.unitPrice)}</td>
                <td>{l.discount ? money(l.discount) : "—"}</td>
                <td>{money(l.quantity * l.unitPrice - (l.discount ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="totals">
          <div>
            <span>جمع اقلام</span>
            <span>{money(linesGross)}</span>
          </div>
          {lineDiscounts > 0 && (
            <div>
              <span>تخفیف ردیف‌ها</span>
              <span>− {money(lineDiscounts)}</span>
            </div>
          )}
          {q.discount > 0 && (
            <div>
              <span>تخفیف پیش‌فاکتور</span>
              <span>− {money(q.discount)}</span>
            </div>
          )}
          <div className="grand">
            <span>مبلغ کل</span>
            <span>{money(q.total)} ریال</span>
          </div>
        </section>

        {q.note && <section className="note">توضیح: {q.note}</section>}

        <section className="note">
          این برگه فاکتور فروش نیست و موجودی کالا را رزرو نمی‌کند. پس از تاریخ
          اعتبار، قیمت‌ها ممکن است تغییر کند.
        </section>

        <ShopPaymentInfo />

        <footer className="sign">
          <div>مهر و امضای فروشنده</div>
          <div>امضای خریدار</div>
        </footer>

        <div className="credit">نرم‌افزار کاردو</div>
      </div>

      <PrintStyles size={size} />
    </>
  );
}
