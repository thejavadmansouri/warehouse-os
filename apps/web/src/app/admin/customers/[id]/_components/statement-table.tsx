"use client";

import Link from "next/link";

import { ExportButton } from "@/app/admin/reports/_components/shared";
import { money, toFa, faDate } from "@/lib/format";
import type {
  LedgerEntryRow,
  LedgerEntryType,
  StatementSummary,
} from "@/lib/types";

/** برچسب هر نوع حرکت — همان زبانی که فروشنده استفاده می‌کند، نه زبان حسابداری. */
const ENTRY_LABELS: Record<LedgerEntryType, string> = {
  OPENING: "مانده‌ی اول دوره",
  INVOICE: "فاکتور",
  RECEIPT: "دریافت",
  INVOICE_CANCELLED: "ابطال فاکتور",
  RETURN: "برگشت کالا",
  CHEQUE_BOUNCED: "چک برگشتی",
  CHEQUE_CASHED: "وصول چک برگشتی",
  FINANCE_CHARGE: "تفاوت فروش مدت‌دار",
  ADJUSTMENT: "اصلاح حساب",
  CORRECTION: "اصلاحیه‌ی فاکتور",
};

/**
 * صورتحساب مشتری — همان کاغذ حسابداری، در صفحه.
 *
 * ترتیبِ ردیف‌ها قدیم به جدید است (مانده‌ی متحرک از سمت سرور می‌آید)، ستون
 * بدهکار/بستانکار جدا شده و نوار چهارکارتی بالای جدول خلاصه‌ی بازه را نشان
 * می‌دهد. دکمه‌ی اکسل همان بازه‌ی فعال را صادر می‌کند.
 */
export function StatementTable({
  customerId,
  rows,
  summary,
  range,
}: {
  customerId: string;
  rows: LedgerEntryRow[];
  summary?: StatementSummary | null;
  /** بازه‌ی فعال — برای خروجی اکسل همان بازه صادر می‌شود. */
  range: { startDate?: string; endDate?: string };
}) {
  const closing = summary?.closingBalance ?? 0;

  return (
    <div className="space-y-4">
      {/* نوار خلاصه — اول دوره / جمع بدهکار / جمع بستانکار / پایان دوره */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryBox label="اول دوره" value={money(summary?.openingBalance)} />
          <SummaryBox
            label="جمع بدهکار"
            value={money(summary?.totalDebit)}
            tone="amber"
          />
          <SummaryBox
            label="جمع بستانکار"
            value={money(summary?.totalCredit)}
            tone="emerald"
          />
          <SummaryBox
            label="پایان دوره"
            value={money(Math.abs(closing))}
            tone={closing > 0 ? "amber" : closing < 0 ? "emerald" : undefined}
            hint={closing > 0 ? "بدهکار" : closing < 0 ? "بستانکار" : "تسویه"}
          />
        </div>
        <ExportButton
          endpoint={`/sales/customers/${customerId}/statement`}
          params={range}
          fileName="صورتحساب"
        />
      </div>

      <div dir="rtl" className="overflow-hidden rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className="border-b px-3 py-2 text-start font-medium">تاریخ</th>
              <th className="border-b px-3 py-2 text-start font-medium">شرح</th>
              <th className="border-b px-3 py-2 text-end font-medium">بدهکار</th>
              <th className="border-b px-3 py-2 text-end font-medium">بستانکار</th>
              <th className="border-b px-3 py-2 text-end font-medium">مانده</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  در این بازه حرکتی روی حساب این مشتری ثبت نشده
                </td>
              </tr>
            ) : (
              rows.map((e) => {
                const balance = e.balance;
                return (
                  <tr
                    key={e.id}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {faDate(e.createdAt)}
                    </td>
                    <td className="min-w-0 px-3 py-2">
                      <span className="block text-sm font-medium">
                        {ENTRY_LABELS[e.type]}
                        {e.invoice && (
                          <>
                            {" "}
                            <Link
                              href={`/admin/invoices/${e.invoice.id}`}
                              className="text-primary hover:underline"
                            >
                              #{toFa(e.invoice.number)}
                            </Link>
                          </>
                        )}
                        {e.receipt && ` #${toFa(e.receipt.number)}`}
                      </span>
                      {e.note && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {e.note}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums text-amber-600">
                      {e.debit > 0 ? money(e.debit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums text-emerald-600">
                      {e.credit > 0 ? money(e.credit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end">
                      <span
                        className={`inline-flex items-center gap-1.5 font-bold tabular-nums ${
                          balance > 0
                            ? "text-amber-600"
                            : balance < 0
                              ? "text-emerald-600"
                              : "text-foreground"
                        }`}
                      >
                        {money(balance)}
                        {/* برچسب جهتِ مانده — بد = بدهکار، بس = بستانکار */}
                        {balance !== 0 && (
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {balance > 0 ? "بد" : "بس"}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "amber" | "emerald";
  hint?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 truncate text-lg font-bold tabular-nums ${toneClass}`}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
