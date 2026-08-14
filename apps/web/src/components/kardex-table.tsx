import Link from "next/link";

export type KardexRow = {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  docType: "SALE" | "PURCHASE" | "RETURN" | "MANUAL" | null;
  docNumber: string | null;
  /** اگر لینکِ جزئیاتِ سند موجود باشد (فعلاً فقط فاکتور فروش)، سند لینک می‌شود. */
  docHref?: string | null;
  locationName: string | null;
  inQty: number;
  outQty: number;
  balance: number;
  unitPrice: number | null;
};

/** خلاصه‌ی بازه — نوار چهارکارتی بالای جدول. */
export interface KardexSummary {
  totalIn: number;
  totalOut: number;
  saleCount: number;
  saleValue: number;
}

export interface Props {
  rows: KardexRow[];
  money: (n: number) => string;
  qty: (n: number) => string;
  faDate: (d: string) => string;
  faDateTime: (d: string) => string;
  toFa: (v: string | number) => string;
  summary?: KardexSummary | null;
}

/** نقطه‌ی رنگیِ نوع حرکت — فقط از توکن‌های تم. */
const DOC_TYPE_DOT: Record<NonNullable<KardexRow["docType"]>, string> = {
  SALE: "bg-primary",
  PURCHASE: "bg-muted-foreground/60",
  RETURN: "bg-destructive",
  MANUAL: "bg-muted-foreground/30",
};

const thCls =
  "sticky top-0 z-10 bg-muted px-3 py-2 text-right font-medium whitespace-nowrap border-b text-muted-foreground";

const tdCls = "px-3 py-2 whitespace-nowrap text-foreground";

export function KardexTable({
  rows,
  money,
  qty,
  faDate,
  faDateTime,
  toFa,
  summary,
}: Props) {
  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCard label="جمع وارد" value={qty(summary.totalIn)} tone="emerald" />
          <SummaryCard label="جمع خارج" value={qty(summary.totalOut)} tone="red" />
          <SummaryCard label="تعداد فروش" value={toFa(summary.saleCount)} />
          <SummaryCard label="ارزش فروش" value={money(summary.saleValue)} />
        </div>
      ) : null}

      <div
        dir="rtl"
        className="max-h-[420px] overflow-auto rounded-lg border bg-card"
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={thCls}>تاریخ</th>
              <th className={thCls}>نوع حرکت</th>
              <th className={thCls}>سند</th>
              <th className={thCls}>مکان</th>
              <th className={thCls}>وارد</th>
              <th className={thCls}>خارج</th>
              <th className={thCls}>مانده</th>
              <th className={thCls}>قیمت واحد</th>
              <th className={thCls}>ارزش</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  حرکتی برای این کالا ثبت نشده است
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                // پایه‌ی تعدادِ جهت‌دار — برای ارزشِ حرکت
                const baseQty = r.inQty > 0 ? r.inQty : r.outQty;
                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className={`${tdCls} text-muted-foreground`}>
                      {faDateTime(r.createdAt)}
                    </td>
                    <td className={tdCls}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            r.docType
                              ? DOC_TYPE_DOT[r.docType]
                              : "bg-muted-foreground/40"
                          }`}
                        />
                        {r.actionLabel || r.action}
                      </span>
                    </td>
                    <td className={`${tdCls} text-muted-foreground`}>
                      {r.docHref ? (
                        <Link
                          href={r.docHref}
                          className="text-primary hover:underline"
                        >
                          {r.docNumber ? toFa(r.docNumber) : "—"}
                        </Link>
                      ) : r.docNumber ? (
                        toFa(r.docNumber)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${tdCls} text-muted-foreground`}>
                      {r.locationName ?? "—"}
                    </td>
                    <td className={`${tdCls} tabular-nums text-emerald-600`}>
                      {r.inQty > 0 ? qty(r.inQty) : "—"}
                    </td>
                    <td className={`${tdCls} tabular-nums text-destructive`}>
                      {r.outQty > 0 ? qty(r.outQty) : "—"}
                    </td>
                    <td className={`${tdCls} font-bold tabular-nums`}>
                      {qty(r.balance)}
                    </td>
                    <td className={`${tdCls} tabular-nums text-muted-foreground`}>
                      {r.unitPrice != null ? money(r.unitPrice) : "—"}
                    </td>
                    <td className={`${tdCls} tabular-nums text-muted-foreground`}>
                      {r.unitPrice != null ? money(r.unitPrice * baseQty) : "—"}
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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "red";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "red"
        ? "text-destructive"
        : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tabular-nums ${color}`}>
        {value}
      </p>
    </div>
  );
}
