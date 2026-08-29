"use client";

import * as React from "react";

import { faDate, faTime, money, toFa } from "@/lib/format";
import type { Invoice } from "@/lib/types";

/**
 * ریزگردش حسابِ یک مشتری — یک جدول، بدون هیچ دکمه‌ای روی ردیف‌ها.
 *
 * هم صندوق (پنل F4) و هم پرونده‌ی مشتری از همین می‌خوانند، تا «فاکتورهای
 * مشتری» در دو جای برنامه دو شکل نداشته باشد.
 *
 * ستون‌ها ته‌رنگ نمی‌گیرند — برخلافِ جدولِ اقلامِ فاکتور، اینجا واحدِ خواندن
 * ردیف است نه ستون، و راه‌راهِ ردیفی کارِ تفکیک را می‌کند.
 */

export interface LedgerRow {
  inv: Invoice;
  /** پرداخت‌شده‌ی همین فاکتور = کل − مانده. */
  paid: number;
  /** مانده‌ی تجمعی تا همین ردیف. */
  balance: number;
}

/**
 * فاکتورها را به ردیف‌های دفتری تبدیل می‌کند.
 *
 * قدیمی‌ترین اول: مانده فقط وقتی معنی دارد که از بالا جمع شود، و سرور
 * جدیدترین را اول می‌دهد.
 */
export function toLedgerRows(invoices: Invoice[]): LedgerRow[] {
  const sorted = [...invoices].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  return sorted.reduce<LedgerRow[]>((acc, inv) => {
    const balance = (acc.at(-1)?.balance ?? 0) + inv.dueAmount;
    acc.push({ inv, paid: inv.total - inv.dueAmount, balance });
    return acc;
  }, []);
}

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

export function CustomerLedgerTable({
  rows,
  active,
  onActivate,
  onOpen,
  empty = "این مشتری هنوز فاکتوری ندارد",
}: {
  rows: LedgerRow[];
  /** ردیفِ زیرِ نشانگرِ کیبورد. */
  active?: number;
  onActivate?: (i: number) => void;
  onOpen?: (i: number) => void;
  empty?: string;
}) {
  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/70 backdrop-blur">
        <tr>
          <th className={`${TH} w-12`}>ردیف</th>
          <th className={`${TH} w-24`}>تاریخ</th>
          <th className={`${TH} w-16`}>ساعت</th>
          <th className={`${TH} w-20`}>فاکتور</th>
          <th className={TH}>شرح</th>
          <th className={`${TH} w-36`}>بدهکار</th>
          <th className={`${TH} w-36`}>بستانکار</th>
          <th className={`${TH} w-40`}>مانده</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.inv.id}
            data-active-row={i === active}
            className={`border-b odd:bg-muted/25 ${onOpen ? "cursor-pointer" : ""}`}
            onMouseEnter={() => onActivate?.(i)}
            onClick={() => onOpen?.(i)}
          >
            <td className={`${TD} tabular-nums text-muted-foreground`}>{toFa(i + 1)}</td>
            <td className={`${TD} tabular-nums text-muted-foreground`}>
              {faDate(r.inv.createdAt)}
            </td>
            <td className={`${TD} tabular-nums text-muted-foreground`}>
              {faTime(r.inv.createdAt)}
            </td>
            <td className={`${TD} font-bold tabular-nums`}>{toFa(r.inv.number)}</td>
            <td className={`${TD} max-w-0 truncate`}>
              {(r.inv.lines ?? []).map((l) => l.product?.name).filter(Boolean).join("، ") ||
                `فاکتور فروش ${toFa(r.inv.number)}`}
            </td>
            <td className={`${TD} text-end tabular-nums`}>{money(r.inv.total)}</td>
            <td className={`${TD} text-end tabular-nums text-success`}>
              {r.paid ? money(r.paid) : "۰"}
            </td>
            <td className={`${TD} text-end font-bold tabular-nums`}>{money(r.balance)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="sticky bottom-0 bg-muted/70 backdrop-blur">
        <tr>
          <td className={`${TD} font-bold`} colSpan={5}>
            جمع
          </td>
          <td className={`${TD} text-end font-bold tabular-nums`}>
            {money(rows.reduce((s, r) => s + r.inv.total, 0))}
          </td>
          <td className={`${TD} text-end font-bold tabular-nums text-success`}>
            {money(rows.reduce((s, r) => s + r.paid, 0))}
          </td>
          <td className={`${TD} text-end font-bold tabular-nums text-warning`}>
            {money(rows.at(-1)?.balance ?? 0)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
