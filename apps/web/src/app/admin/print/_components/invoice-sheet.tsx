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
 *
 * برگه فقط **وضعیتِ نهاییِ خالص** را می‌بیند: تعدادِ ماندهِ هر قلم، آخرین قیمتِ
 * تصحیح‌شده، و مبلغِ نهایی پس از همه‌ی مرجوعی‌ها. ردیفی که کاملاً برگشته اصلاً
 * روی کاغذ نمی‌آید و هیچ ردی از مرجوعی/اصلاحیه روی برگه چاپ نمی‌شود — سابقه
 * در سیستم کامل می‌ماند، ولی چیزی که مشتری می‌بیند یک فاکتورِ تمیز است.
 */
export function InvoiceSheet({
  invoice: inv,
  size,
}: {
  invoice: Invoice;
  size: PaperSize;
}) {
  const refundTotal = inv.refundTotal ?? 0;
  const hasReturns = refundTotal > 0;

  /*
   * وضعیتِ نهاییِ هر قلم:
   *   • تعداد = ماندهِ قلم (netQuantity) — ردیفِ کاملاً برگشتی (ماندهِ صفر) حذف.
   *   • قیمت = آخرین قیمتِ تصحیح‌شده.
   *   • وقتی فاکتور مرجوعی دارد، قیمتِ چاپ‌شده «قیمتِ مؤثرِ هر واحد» است —
   *     همان چیزی که واقعاً بابتِ هر عدد گرفته شده؛ جمعِ برگه این‌طوری با
   *     مبلغِ نهایی دقیقاً می‌خواند و تخفیف‌ها داخلِ قیمتِ واحد می‌نشینند.
   */
  const netLines = (inv.lines ?? [])
    .map((l) => {
      const q = l.netQuantity ?? Math.abs(l.quantity);
      const unit =
        hasReturns && l.effectiveUnitPrice != null
          ? l.effectiveUnitPrice
          : (l.currentUnitPrice ?? l.unitPrice ?? 0);
      const disc = hasReturns ? 0 : (l.netLineDiscount ?? l.lineDiscount ?? 0);
      return { ...l, q, unit, disc };
    })
    .filter((l) => l.q > 0);

  const linesGross = netLines.reduce((s, l) => s + l.q * l.unit, 0);
  /*
   * فاکتورهای پیش از افزوده‌شدن ستون تخفیفِ ردیف، مقدارشان null است. آنجا تخفیف
   * ردیفی را از اختلافِ جمع ردیف‌ها با subtotal درمی‌آوریم تا جمع‌های پایینِ برگه
   * همیشه درست بخوانند، حتی اگر نشود گفت روی کدام قلم بوده.
   */
  const lineDiscounts =
    netLines.reduce((s, l) => s + (l.netLineDiscount ?? l.lineDiscount ?? 0), 0) ||
    (hasReturns ? 0 : Math.max(0, linesGross - inv.subtotal));
  const perLineKnown = !hasReturns && lineDiscounts > 0;
  /** مبلغِ نهایی: جمعِ فاکتور منهم همه‌ی وجهِ برگشتی — وضعیتِ واقعیِ حسابِ همین برگه. */
  const payable = Math.max(0, inv.total - refundTotal);
  const cancelled = inv.status === "CANCELLED";

  return (
    <>
      <div className={`sheet ${size}`} dir="rtl">
        {cancelled && <div className="void">باطل شده</div>}

        {/*
          سربرگ، مشخصات و خریدار در یک نوار.

          قبلاً سه بلوکِ جدا بودند (عنوان + جدولِ شماره/تاریخ + بخشِ خریدار) و
          روی A5 نزدیک یک‌سومِ برگه را می‌گرفتند پیش از آنکه اولین قلم بیاید.
          محتوا همان است، فقط دیگر هرکدام سطرِ خودشان را نمی‌خواهند.
        */}
        <header className="head">
          <div className="head-shop">
            <div className="title">فاکتور فروش</div>
            <ShopHeader fallbackName={inv.warehouse?.name} />
          </div>

          <div className="head-meta">
            <div>
              <span className="muted">شماره </span>
              <span className="num strong">{toFa(inv.number)}</span>
              <span className="muted"> · تاریخ </span>
              <span className="num">{faDate(inv.createdAt)}</span>
            </div>
            <div>
              <span className="muted">خریدار </span>
              <span className="strong">{inv.customer?.fullName ?? "مشتری نقدی"}</span>
              {inv.customer?.phones?.[0]?.phone && (
                <span className="num muted"> · {toFa(inv.customer.phones[0].phone)}</span>
              )}
            </div>
            {inv.user && <div className="muted">فروشنده: {inv.user.fullName}</div>}
          </div>
        </header>

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
            {netLines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td className="num center">{toFa(i + 1)}</td>
                <td>
                  {l.product?.name ?? "—"}
                  {l.product?.sku && (
                    <span className="muted sku"> · کد {toFa(l.product.sku)}</span>
                  )}
                  {/* توضیحِ دستیِ فروشنده — خطِ دوم، ریزتر. */}
                  {l.lineNote && <div className="line-note">{l.lineNote}</div>}
                </td>
                <td className="num center">
                  {qty(l.q)} {l.product?.unit ?? ""}
                </td>
                <td className="num">{money(l.unit)}</td>
                {perLineKnown && <td className="num">{l.disc ? money(l.disc) : "—"}</td>}
                <td className="num strong">{money(l.q * l.unit - l.disc)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="totals">
          <table>
            <tbody>
              <tr>
                <td>جمع اقلام</td>
                <td className="num">{money(linesGross)}</td>
              </tr>
              {/*
                وقتی فاکتور مرجوعی دارد، تخفیف‌ها داخلِ قیمتِ مؤثرِ هر واحد
                نشسته‌اند — ردیفِ جداگانه‌ی تخفیف دوبارِ حساب‌شدن می‌شد.
              */}
              {!hasReturns && lineDiscounts > 0 && (
                <tr>
                  <td>تخفیف اقلام</td>
                  <td className="num">− {money(lineDiscounts)}</td>
                </tr>
              )}
              {!hasReturns && inv.discount > 0 && (
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
                <td className="num">{amount(payable)}</td>
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

        {/*
          پرداخت، توضیح، اطلاعات بانکی و امضاها — یک ردیفِ سه‌ستونه به‌جای
          چهار بلوکِ پشتِ‌سرِ‌هم. روی A5 همین چهار بلوک بود که برگه را به
          صفحه‌ی دوم می‌برد، حتی وقتی فقط شش قلم داشت.
        */}
        <footer className="foot">
          <div className="foot-col">
            {(inv.payments ?? []).length > 0 && (
              <div className="muted">
                پرداخت:{" "}
                {inv.payments!
                  .map((p) =>
                    // مبلغِ منفی = ردیفِ «اصلاح نحوهٔ پرداخت» که سهمِ قبلی را
                    // برمی‌دارد؛ روی کاغذ با کلمهٔ «برداشت» خوانده می‌شود تا
                    // جهتِ پول اشتباه فهمیده نشود.
                    p.amount < 0
                      ? `${PAYMENT_LABELS[p.method] ?? p.method} ${money(-p.amount)} (برداشت)`
                      : `${PAYMENT_LABELS[p.method] ?? p.method} ${money(p.amount)}`,
                  )
                  .join(" · ")}
              </div>
            )}
            {inv.note && <div className="muted">توضیح: {inv.note}</div>}
            <ShopPaymentInfo />
          </div>

          <div className="foot-sign">
            <div>مهر و امضای فروشنده</div>
            <div>امضای خریدار</div>
          </div>
        </footer>

        <div className="credit">نرم‌افزار کاردو</div>
      </div>

      <PrintStyles size={size} />
    </>
  );
}
