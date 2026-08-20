"use client";

import { PrintStyles, type PaperSize } from "./print-styles";
import { ShopHeader, ShopPaymentInfo } from "./shop-header";

import { faDate, money, qty, toFa, PAYMENT_LABELS } from "@/lib/format";
import type { OpenAccountSheet as Sheet } from "@/lib/types";

export type { PaperSize };

/**
 * برگه‌ی تجمیعیِ یک حساب باز — «فاکتور کلی».
 *
 * چرا یک برگه و نه چند فاکتور: مشتری در چند نوبت جنس برده و سرِ تسویه یک کاغذ
 * می‌خواهد که همه‌اش را نشان دهد، نه سه برگه‌ی جدا که خودش باید جمع بزند. پس
 * نوبت‌ها داخلِ یک جدولِ پیوسته می‌آیند، با یک ردیفِ عنوان برای هر نوبت، و
 * شماره‌ی ردیف در کلِ برگه پشت‌سرهم می‌رود.
 *
 * قلمی که مرجوعی خورده حذف نمی‌شود؛ با تعدادِ مؤثر و نشانِ «مرجوعی» می‌ماند.
 * روی کاغذی که مشتری امضا می‌کند، ناپدیدشدنِ یک قلم بدتر از دیدنِ صفر است.
 */
export function OpenAccountSheet({
  sheet,
  size,
}: {
  sheet: Sheet;
  size: PaperSize;
}) {
  const t = sheet.totals;
  const settled = sheet.status === "SETTLED";

  /*
   * شماره‌ی ردیف در کلِ برگه پیوسته است، نه داخلِ هر نوبت.
   *
   * با یک شمارنده‌ی بیرونی و `++` حین رندر هم می‌شد، ولی آن یعنی جهش در حین
   * رندر: در رندرِ دوباره عددها جابه‌جا می‌شوند. به‌جایش آفستِ هر نوبت از
   * تعدادِ ردیف‌های نوبت‌های قبلی ساخته می‌شود — خالص و قابلِ تکرار.
   */
  const offsets = sheet.visits.reduce<number[]>(
    (acc, v, i) => [...acc, acc[i] + v.lines.length],
    [0],
  );

  const visits = sheet.visits.map((v, vi) => ({
    visit: v,
    rows: v.lines.map((line, li) => ({ line, no: offsets[vi] + li + 1 })),
    /*
     * جمعِ خودِ ردیف‌ها — نه `v.net`.
     *
     * `net` تخفیفِ کلِ فاکتور را هم کم کرده، ولی ردیف‌ها آن را ندارند؛ اگر
     * سرستونِ نوبت `net` را نشان دهد، مشتری ستون را جمع می‌زند و به عددِ
     * دیگری می‌رسد. تخفیف یک بار و به‌صورت صریح در جمعِ پایین می‌آید.
     */
    gross: v.lines.reduce((s, l) => s + Math.max(0, l.lineTotal), 0),
  }));

  /*
   * جمعِ اقلامِ کلِ برگه و «تخفیف»ی که آن را به مبلغِ قابل پرداخت می‌رساند.
   *
   * این تخفیف فقط تخفیفِ فاکتور نیست؛ سهمِ تخفیف از اقلامِ مرجوعی‌شده را هم در
   * خود دارد (مبلغِ برگشت به مشتری، قیمتِ مؤثر است نه قیمتِ خام). چون از تفاضل
   * ساخته می‌شود، برگه در هر حالتی سرجمع می‌خورد — و همین مهم است.
   */
  const itemsGross = visits.reduce((s, v) => s + v.gross, 0);
  const reduction = itemsGross - t.net;

  return (
    <>
      <div className={`sheet ${size}`} dir="rtl">
        <header className="head">
          <div>
            <div className="title">صورت‌حساب کلی</div>
            <ShopHeader />
          </div>
          <table className="meta">
            <tbody>
              <tr>
                <td className="muted">شماره حساب</td>
                <td className="num strong">{toFa(sheet.number)}</td>
              </tr>
              <tr>
                <td className="muted">تاریخ بازشدن</td>
                <td className="num">{faDate(sheet.createdAt)}</td>
              </tr>
              {settled && sheet.settledAt && (
                <tr>
                  <td className="muted">تاریخ تسویه</td>
                  <td className="num strong">{faDate(sheet.settledAt)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </header>

        <section className="party">
          <div>
            <span className="muted">خریدار: </span>
            <span className="strong">{sheet.customerName}</span>
          </div>
          {sheet.phone && (
            <div dir="ltr" className="num muted">
              {toFa(sheet.phone)}
            </div>
          )}
          <div className="muted">
            {toFa(sheet.visits.length)} نوبت خرید
            {!settled && " · تسویه‌نشده"}
          </div>
        </section>

        <table className="items">
          <thead>
            <tr>
              <th className="w-row">ردیف</th>
              <th>شرح کالا</th>
              <th className="w-qty">تعداد</th>
              <th className="w-price">قیمت واحد</th>
              <th className="w-price">مبلغ</th>
            </tr>
          </thead>
          <tbody>
            {visits.map(({ visit: v, rows, gross }) => (
              <VisitRows key={v.id} visit={v} rows={rows} gross={gross} />
            ))}
          </tbody>
        </table>

        <section className="totals">
          <table>
            <tbody>
              <tr>
                <td>جمع اقلام</td>
                <td className="num">{money(itemsGross)}</td>
              </tr>
              {reduction > 0 && (
                <tr>
                  <td>تخفیف</td>
                  <td className="num">− {money(reduction)}</td>
                </tr>
              )}
              {reduction < 0 && (
                <tr>
                  <td>اصلاحیه</td>
                  <td className="num">+ {money(-reduction)}</td>
                </tr>
              )}
              <tr className="grand">
                <td>مبلغ قابل پرداخت</td>
                <td className="num">{money(t.net)} ریال</td>
              </tr>
              {t.paid > 0 && (
                <tr>
                  <td>پرداخت‌شده</td>
                  <td className="num">− {money(t.paid)}</td>
                </tr>
              )}
              {t.remaining > 0 && (
                <tr className="due">
                  <td>مانده</td>
                  <td className="num">{money(t.remaining)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {sheet.payments.length > 0 && (
          <section className="pay">
            <b>نحوه‌ی پرداخت: </b>
            {sheet.payments.map((p, i) => (
              <span key={`${p.receiptNumber}-${i}`}>
                {i > 0 && " · "}
                {PAYMENT_LABELS[p.method] ?? p.method} {money(p.amount)}
                {p.cheque && (
                  <span className="muted">
                    {" "}
                    (چک {toFa(p.cheque.number)}
                    {p.cheque.bankName ? ` — ${p.cheque.bankName}` : ""}، سررسید{" "}
                    {faDate(p.cheque.dueDate)})
                  </span>
                )}
              </span>
            ))}
          </section>
        )}

        {sheet.returns.length > 0 && (
          <section className="pay muted">
            <b>مرجوعی‌ها: </b>
            {sheet.returns
              .map(
                (r) =>
                  `${toFa(r.number)} — ${faDate(r.createdAt)} — ${money(r.refundAmount)}`
              )
              .join(" · ")}
          </section>
        )}

        {sheet.note && <section className="note">توضیح: {sheet.note}</section>}

        <ShopPaymentInfo />

        <footer className="sign">
          <div>مهر و امضای فروشنده</div>
          <div>امضای خریدار</div>
        </footer>

        <div className="credit">نرم‌افزار کاردو</div>
      </div>

      <PrintStyles size={size} />

      {/*
        فقط چیزهایی که مخصوصِ همین برگه‌اند. بقیه از PrintStyles می‌آید تا این
        کاغذ و فاکتورِ تک‌نوبتی کنارِ هم روی پیشخوان یک‌شکل باشند.
      */}
      <style jsx global>{`
        .items tr.visit td {
          background: #f1f5f9;
          font-weight: 700;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .items tr.gone td {
          color: #64748b;
          text-decoration: line-through;
        }
        .ret {
          font-size: 0.85em;
          color: #b45309;
        }
      `}</style>
    </>
  );
}

/** ردیف‌های یک نوبت: یک سطرِ عنوان (شماره و تاریخِ همان نوبت) و بعد اقلامش. */
function VisitRows({
  visit,
  rows,
  gross,
}: {
  visit: Sheet["visits"][number];
  rows: { line: Sheet["visits"][number]["lines"][number]; no: number }[];
  /** جمعِ همین ردیف‌ها — تا ستون با سرستون بخواند. */
  gross: number;
}) {
  return (
    <>
      <tr className="visit">
        <td colSpan={4}>
          نوبت {toFa(visit.number)} · {faDate(visit.createdAt)}
        </td>
        <td className="num">{money(gross)}</td>
      </tr>

      {rows.map(({ line: l, no }) => {
        const gone = l.effectiveQuantity <= 0;
        return (
          <tr key={l.id} className={gone ? "gone" : ""}>
            <td className="num center">{toFa(no)}</td>
            <td>
              {l.productName}
              {l.sku && <span className="muted sku"> · کد {toFa(l.sku)}</span>}
              {l.returnedQuantity > 0 && (
                <span className="ret"> · {toFa(l.returnedQuantity)} مرجوعی</span>
              )}
            </td>
            <td className="num center">
              {qty(Math.max(0, l.effectiveQuantity))} {l.unit ?? ""}
            </td>
            <td className="num">{money(l.unitPrice)}</td>
            <td className="num strong">{money(Math.max(0, l.lineTotal))}</td>
          </tr>
        );
      })}
    </>
  );
}
