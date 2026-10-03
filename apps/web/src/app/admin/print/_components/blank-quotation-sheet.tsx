"use client";

import { amount, faDate, money, qty, toFa } from "@/lib/format";
import type { BlankQuotation } from "@/lib/types";

import { PrintStyles, type PaperSize } from "./print-styles";
import { ShopHeader } from "./shop-header";

/**
 * برگه‌ی چاپ پیش‌فاکتور سفید.
 *
 * با `QuotationSheet` دو تفاوت جدی دارد و همین‌ها باعث شده جدا نوشته شود:
 *
 *  ۱) اقلامش **متنِ آزاد** هستند و ممکن است به هیچ کالای سیستم وصل نباشند، پس
 *     ستون «کد کالا» ندارد و نامِ ردیف همان چیزی است که کارگر گفته.
 *  ۲) قیمت ممکن است هنوز **نهایی نشده** باشد؛ ردیفِ بی‌قیمت خالی چاپ می‌شود تا
 *     روی همان کاغذ با دست پر شود. این برگه دو کاربرد دارد: لیست قیمتِ مشتری،
 *     و برگه‌ای که مدیر روی آن قیمت می‌گذارد.
 */
export function BlankQuotationSheet({
  quotation: q,
  size,
  showLinkedName,
}: {
  quotation: BlankQuotation;
  size: PaperSize;
  showLinkedName?: boolean;
}) {
  const lines = q.lines ?? [];
  const showName = showLinkedName ?? true;
  const unpriced = lines.filter((l) => l.pricedAt === null).length;
  const cancelled = q.displayStatus === "CANCELLED";
  const expired = q.displayStatus === "EXPIRED";

  return (
    <>
      <div className={`sheet ${size}`} dir="rtl">
        {cancelled && <div className="void">باطل شده</div>}
        {!cancelled && expired && <div className="void">منقضی شده</div>}

        <header className="head">
          <div>
            <div className="title">پیش فاکتور</div>
            <ShopHeader />
            <div className="muted">سند فروش نیست — فقط اعلام قیمت</div>
          </div>
          <div className="meta">
            <div>
              {/* سری شماره جدا از پیش‌فاکتور عادی است، پس پیشوند لازم است. */}
              شماره: <b>سفید {toFa(q.number)}</b>
            </div>
            <div>تاریخ: {faDate(q.createdAt)}</div>
            {q.user?.fullName && <div>ثبت‌کننده: {q.user.fullName}</div>}
          </div>
        </header>

        <section className="party">
          <div>
            <span className="muted">مشتری: </span>
            <b>{q.customerName ?? "—"}</b>
            {q.customer && q.customer.fullName && (
              <span className="muted"> (پرونده: {q.customer.fullName})</span>
            )}
          </div>
          {q.validUntil && (
            <div>
              <span className="muted">معتبر تا: </span>
              <b>{faDate(q.validUntil)}</b>
            </div>
          )}
        </section>

        <table className="items">
          <thead>
            <tr>
              <th className="w-row">#</th>
              <th>شرح</th>
              <th className="w-qty">تعداد</th>
              <th className="w-price">قیمت واحد</th>
              <th className="w-price">مبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td>{toFa(i + 1)}</td>
                <td>
                  {l.text}
                  {showName && l.product && (
                    <div className="line-note">{l.product.name}</div>
                  )}
                </td>
                <td className="center">
                  {qty(l.quantity)} {l.product?.unit ?? ""}
                </td>
                {/* ردیفِ بی‌قیمت خالی می‌ماند تا با دست پر شود، نه اینکه «۰» چاپ شود. */}
                <td className="num">
                  {l.finalPrice === null ? "" : money(l.finalPrice)}
                </td>
                <td className="num">
                  {l.finalPrice === null ? "" : money(l.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="totals">
          {unpriced > 0 ? (
            <div>
              {/* جمعِ ناقص، «جمع» نیست — با صراحت نوشته می‌شود. */}
              <span>جمع {toFa(lines.length - unpriced)} قلم قیمت‌خورده</span>
              <span>{money(q.total)}</span>
            </div>
          ) : (
            <div className="grand">
              <span>جمع کل</span>
              <span>{amount(q.total)}</span>
            </div>
          )}
        </section>

        {q.note && <section className="note">توضیح: {q.note}</section>}

        <section className="note">
          {unpriced > 0
            ? `قیمت ${toFa(unpriced)} قلم روی این برگه خالی است و پس از اعلام، تکمیل می‌شود.`
            : "این برگه فاکتور فروش نیست و موجودی کالا را رزرو نمی‌کند."}
        </section>

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
