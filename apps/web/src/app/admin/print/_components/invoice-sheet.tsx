"use client";

import { PrintStyles, type PaperSize } from "./print-styles";
import { ShopHeader, ShopPaymentInfo } from "./shop-header";

import { amount, faDate, money, qty, toFa, PAYMENT_LABELS } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export type { PaperSize };

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
            <ShopHeader fallbackName={inv.warehouse?.name} />
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
              {/*
                سودِ مدت روی برگه صریح می‌آید، نه قاطیِ مبلغ.
                مشتری باید بتواند ستون را جمع بزند و به همین عدد برسد؛ و «تفاوت
                فروش مدت‌دار» چیزی است که خودش هم سرِ خرید قبولش کرده.
              */}
              {!!inv.financeCharge && inv.financeCharge > 0 && (
                <tr>
                  <td>تفاوت فروش مدت‌دار</td>
                  <td className="num">+ {money(inv.financeCharge)}</td>
                </tr>
              )}
              <tr className="grand">
                <td>مبلغ قابل پرداخت</td>
                <td className="num">{amount(inv.total)}</td>
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
