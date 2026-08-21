"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCustomer, getCustomerFullStatement, getStatement } from "@/lib/api";
import { amount, faDate, money, qty, toFa, PAYMENT_LABELS } from "@/lib/format";
import { JalaliDateInput } from "@/components/jalali-date-input";
import type { CustomerFullStatement, LedgerEntryType } from "@/lib/types";

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
  CHEQUE_CASHED: "وصول چک برگشتی",
  FINANCE_CHARGE: "تفاوت فروش مدت‌دار",
  ADJUSTMENT: "اصلاح حساب",
  CORRECTION: "اصلاحیه‌ی فاکتور",
};

/** پایانِ همان روز، تا فیلترِ «تا تاریخ» کلِ آن روز را هم بگیرد. */
function endOfDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * صورت‌حساب مشتری — کاملِ کامل.
 *
 * این همان کاغذی است که مشتری می‌خواهد ببرد، و سؤالش هیچ‌وقت فقط «چقدر بدهکارم»
 * نیست؛ «کدام جنس‌ها را بردم و کِی چقدر دادم» است. پس برگه سه بخش دارد:
 *
 *   ۱. اقلام — نوبت به نوبت، با نام و کد و تعداد و قیمتِ هر قلم.
 *   ۲. پرداخت‌ها — چه آنچه سرِ خرید داده، چه رسیدهای بعدی، با مشخصاتِ چک.
 *   ۳. گردش حساب — همان دفتر با مانده‌ی تجمعی، برای آشتیِ نهایی.
 *
 * بدون بخش ۱ و ۲، مشتری باید حرفِ ما را باور کند؛ با آن‌ها می‌تواند خودش
 * بشمارد. اولین جایی که سرِ عدد دعوا می‌شود دقیقاً همین‌جاست.
 *
 * پیش‌فرض A4، چون این برگه ذاتاً بلند است.
 */
export default function StatementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [size, setSize] = useState<PaperSize>("a4");
  /** بازه‌ی صورت‌حساب. خالی یعنی از اول تا امروز. */
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** گردشِ حسابِ دفتری روی کاغذ بیاید؟ برای مشتریِ پرتراکنش گاهی اضافه است. */
  const [withLedger, setWithLedger] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("size");
    if (s === "a4" || s === "a5") setSize(s);
    if (p.get("from")) setFrom(p.get("from")!);
    if (p.get("to")) setTo(p.get("to")!);
    if (p.get("ledger") === "0") setWithLedger(false);
  }, []);

  const range = {
    startDate: from ? new Date(from).toISOString() : undefined,
    endDate: to ? endOfDay(to) : undefined,
  };

  const customer = useQuery({
    queryKey: ["statement-print-customer", id],
    queryFn: () => getCustomer(id),
  });
  const statement = useQuery({
    queryKey: ["statement-print", id, from, to],
    queryFn: () => getStatement(id, { limit: 500, ...range }),
  });
  const full = useQuery({
    queryKey: ["statement-print-full", id, from, to],
    queryFn: () => getCustomerFullStatement(id, range),
  });

  const loading = customer.isLoading || statement.isLoading || full.isLoading;

  if (loading) return <p className="p-6 text-sm">در حال آماده‌سازی…</p>;
  if (customer.isError || !customer.data)
    return <p className="p-6 text-sm">مشتری پیدا نشد.</p>;

  const c = customer.data;
  const s = c.summary;
  const rows = statement.data?.rows.data ?? [];
  const f = full.data;

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5 text-sm">
        <span className="text-slate-600">کاغذ:</span>
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

        <span className="ms-3 text-slate-600">از:</span>
        <JalaliDateInput value={from} onChange={setFrom} />
        <span className="text-slate-600">تا:</span>
        <JalaliDateInput value={to} onChange={setTo} />
        {(from || to) && (
          <button
            type="button"
            onClick={() => { setFrom(""); setTo(""); }}
            className="rounded-md border border-slate-300 px-3 py-1 text-slate-700"
          >
            کلِ تاریخچه
          </button>
        )}

        <label className="ms-3 flex cursor-pointer items-center gap-1.5 text-slate-700">
          <input
            type="checkbox"
            checked={withLedger}
            onChange={(e) => setWithLedger(e.target.checked)}
          />
          گردش حساب
        </label>

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
            {(from || to) && (
              <div className="muted">
                بازه: {from ? faDate(new Date(from).toISOString()) : "ابتدا"} تا{" "}
                {to ? faDate(new Date(to).toISOString()) : "امروز"}
              </div>
            )}
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
          {!!f?.customer.address && (
            <div className="muted">{f.customer.address}</div>
          )}
        </section>

        {/* ---------- ۱) کالاهایی که برده ---------- */}
        {!!f?.purchases.length && (
          <>
            <h2 className="sec">کالاهای خریداری‌شده</h2>
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
                {numbered(f).map(({ purchase, lines, gross }) => (
                  <PurchaseRows
                    key={purchase.id}
                    purchase={purchase}
                    lines={lines}
                    gross={gross}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ---------- ۲) پرداخت‌ها ---------- */}
        <h2 className="sec">پرداخت‌ها</h2>
        {allPayments(f).length === 0 ? (
          <p className="muted">در این بازه پرداختی ثبت نشده است.</p>
        ) : (
          <table className="items">
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>بابت</th>
                <th>روش</th>
                <th className="w-price">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {allPayments(f).map((p) => (
                <tr key={p.key}>
                  <td className="num">{faDate(p.createdAt)}</td>
                  <td>
                    {p.forWhat}
                    {p.cheque && (
                      <div className="muted">
                        چک {toFa(p.cheque.number)}
                        {p.cheque.bankName ? ` — ${p.cheque.bankName}` : ""}، سررسید{" "}
                        {faDate(p.cheque.dueDate)}
                      </div>
                    )}
                  </td>
                  <td>{PAYMENT_LABELS[p.method] ?? p.method}</td>
                  <td className="num strong">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ---------- ۳) گردش حساب ---------- */}
        {withLedger && !!rows.length && (
          <>
            <h2 className="sec">گردش حساب</h2>
            <table className="items">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>شرح</th>
                  <th className="w-price">بدهکار</th>
                  <th className="w-price">بستانکار</th>
                  <th className="w-price">مانده</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{faDate(e.createdAt)}</td>
                    <td>
                      {LABELS[e.type]}
                      {e.note && <div className="muted">{e.note}</div>}
                    </td>
                    <td className="num">{e.amount > 0 ? money(e.amount) : "—"}</td>
                    <td className="num">
                      {e.amount < 0 ? money(Math.abs(e.amount)) : "—"}
                    </td>
                    <td className="num">{money(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ---------- جمع‌ها ---------- */}
        <section className="totals">
          <table>
            <tbody>
              {!!f && f.totals.openingBalance !== 0 && (
                <tr>
                  <td>مانده‌ی اول دوره</td>
                  <td className="num">{money(f.totals.openingBalance)}</td>
                </tr>
              )}
              {!!f && (
                <>
                  <tr>
                    <td>جمع خرید</td>
                    <td className="num">{money(f.totals.purchasedGross)}</td>
                  </tr>
                  {f.totals.returned > 0 && (
                    <tr>
                      <td>برگشت کالا</td>
                      <td className="num">− {money(f.totals.returned)}</td>
                    </tr>
                  )}
                  {f.totals.corrections !== 0 && (
                    <tr>
                      <td>اصلاحیه</td>
                      <td className="num">
                        {f.totals.corrections > 0 ? "+ " : "− "}
                        {money(Math.abs(f.totals.corrections))}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>جمع پرداختی</td>
                    <td className="num">− {money(f.totals.paidTotal)}</td>
                  </tr>
                </>
              )}
              {!!s?.overdue && (
                <tr className="due">
                  <td>از این مبلغ، سررسید گذشته</td>
                  <td className="num">{money(s.overdue)}</td>
                </tr>
              )}
              <tr className="grand">
                <td>{(s?.totalDue ?? 0) >= 0 ? "مانده‌ی بدهی" : "بستانکار"}</td>
                <td className="num">{amount(Math.abs(s?.totalDue ?? 0))}</td>
              </tr>
            </tbody>
          </table>
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

        <div className="credit">نرم‌افزار کاردو</div>
      </div>

      <PrintStyles size={size} />

      <style jsx global>{`
        .sec {
          margin: 5mm 0 2mm;
          font-size: 1.05em;
          font-weight: 800;
          border-bottom: 1px solid #94a3b8;
          padding-bottom: 1mm;
        }
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

/**
 * شماره‌گذاریِ پیوسته در کلِ برگه + جمعِ ردیف‌های هر خرید.
 *
 * شماره از هر فاکتور از نو شروع نمی‌شود؛ مشتری برگه را از بالا می‌شمارد.
 * جمعِ سرستون هم از خودِ ردیف‌ها می‌آید نه از `netTotal`، وگرنه ستون با سرستون
 * نمی‌خواند (تخفیفِ کلِ فاکتور در ردیف‌ها نیست) و همان‌جا بحث شروع می‌شود.
 */
function numbered(f: CustomerFullStatement) {
  const offsets = f.purchases.reduce<number[]>(
    (acc, p, i) => [...acc, acc[i] + p.lines.length],
    [0],
  );
  return f.purchases.map((purchase, pi) => ({
    purchase,
    lines: purchase.lines.map((line, li) => ({ line, no: offsets[pi] + li + 1 })),
    gross: purchase.lines.reduce((s, l) => s + Math.max(0, l.lineTotal), 0),
  }));
}

/**
 * همه‌ی پرداخت‌ها در یک فهرستِ زمانی — چه سرِ خرید، چه رسیدِ بعدی.
 *
 * مشتری بین این دو فرق نمی‌گذارد؛ برایش «پولی که دادم» یکی است. جدا نگه‌داشتنشان
 * روی کاغذ فقط این سؤال را می‌سازد که «پس آن پنجاه تومنی که آن روز دادم کجاست».
 */
function allPayments(f?: CustomerFullStatement) {
  if (!f) return [];

  const atSale = f.purchases.flatMap((p) =>
    p.payments.map((row) => ({
      key: `s-${row.id}`,
      createdAt: p.createdAt,
      forWhat: `فاکتور ${toFa(p.number)}`,
      method: row.method,
      amount: row.amount,
      cheque: row.cheque,
    })),
  );

  const later = f.payments.flatMap((r) =>
    r.rows.map((row) => ({
      key: `r-${row.id}`,
      createdAt: r.createdAt,
      forWhat: `رسید ${toFa(r.number)}`,
      method: row.method,
      amount: row.amount,
      cheque: row.cheque,
    })),
  );

  return [...atSale, ...later].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/** ردیف‌های یک خرید: سطرِ عنوان (شماره و تاریخ) و بعد اقلامش. */
function PurchaseRows({
  purchase: p,
  lines,
  gross,
}: {
  purchase: CustomerFullStatement["purchases"][number];
  lines: {
    line: CustomerFullStatement["purchases"][number]["lines"][number];
    no: number;
  }[];
  gross: number;
}) {
  return (
    <>
      <tr className="visit">
        <td colSpan={4}>
          فاکتور {toFa(p.number)} · {faDate(p.createdAt)}
          {p.status === "OPEN" && <span className="ret"> · حساب باز</span>}
        </td>
        <td className="num">{money(gross)}</td>
      </tr>

      {lines.map(({ line: l, no }) => {
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
