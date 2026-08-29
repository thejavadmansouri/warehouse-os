"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getQuotations } from "@/lib/api";
import { faDate, faTime, money, toFa } from "@/lib/format";

/**
 * پیش‌فاکتورهای باز — همان‌جا در صندوق.
 *
 * تا حالا پیش‌فاکتور در صندوق ساخته می‌شد ولی برای برگرداندنش باید به صفحه‌ی
 * پیش‌فاکتورها می‌رفتی و «ادامه در صندوق» می‌زدی. مشتری که برمی‌گردد و
 * می‌گوید «همان قیمتی که دادی»، فروشنده باید صندوق را ترک کند.
 *
 * فقط ACTIVE نشان داده می‌شود: منقضی و تبدیل‌شده تاریخچه‌اند و جایشان در
 * صفحه‌ی اسناد است، نه اینجا که باید سریع باشد.
 */
const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

export function OpenQuotations({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  /** بارگذاری در سبد — منطقش یکی است با مسیرِ `?quotation=`. */
  onPick: (quotationId: string) => void;
  onClose: () => void;
}) {
  const [row, setRow] = useState(0);

  const list = useQuery({
    queryKey: ["pos-open-quotations"],
    queryFn: () => getQuotations({ status: "ACTIVE", limit: 100 }),
    enabled: open,
    staleTime: 10_000,
  });

  const rows = list.data?.data ?? [];

  useEffect(() => {
    if (open) setRow(0);
  }, [open]);

  useEffect(() => {
    document
      .querySelector('[data-quotes-panel] [data-active-row="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [row, rows.length]);

  if (!open) return null;

  return (
    <div
      data-quotes-panel
      tabIndex={-1}
      ref={(el) => el?.focus()}
      className="absolute inset-0 z-30 flex flex-col bg-background outline-none"
      onKeyDown={(e) => {
        switch (e.key) {
          case "Escape":
            e.preventDefault();
            e.stopPropagation();
            onClose();
            return;
          case "ArrowDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 1, Math.max(rows.length - 1, 0)));
            return;
          case "ArrowUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 1, 0));
            return;
          case "Enter":
            e.preventDefault();
            if (rows[row]) onPick(rows[row].id);
            return;
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <span className="font-bold">پیش‌فاکتورهای باز</span>
        <span className="text-xs text-muted-foreground">
          {toFa(rows.length)} مورد — قیمتشان هنوز معتبر است
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {list.isFetching ? "…" : "پیش‌فاکتور بازی نیست"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-20`}>شماره</th>
                <th className={`${TH} w-24`}>تاریخ</th>
                <th className={`${TH} w-16`}>ساعت</th>
                <th className={TH}>مشتری</th>
                <th className={`${TH} w-16 text-center`}>اقلام</th>
                <th className={`${TH} w-28`}>اعتبار</th>
                <th className={`${TH} w-36`}>مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  data-active-row={i === row}
                  onMouseEnter={() => setRow(i)}
                  onClick={() => onPick(r.id)}
                  title="بارگذاری این پیش‌فاکتور در سبد"
                  className="cursor-pointer border-b odd:bg-muted/25"
                >
                  <td className={`${TD} font-bold tabular-nums`}>{toFa(r.number)}</td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faDate(r.createdAt)}
                  </td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faTime(r.createdAt)}
                  </td>
                  <td className={`${TD} max-w-0 truncate`}>
                    {r.customerName ?? "بدون مشتری"}
                  </td>
                  <td className={`${TD} text-center tabular-nums`}>
                    {toFa(r._count?.lines ?? 0)}
                  </td>
                  <td className={`${TD} text-xs`}>{remaining(r.remainingMinutes)}</td>
                  <td className={`${TD} text-end font-bold tabular-nums`}>{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-x-5 border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        {(
          [
            ["↑↓", "حرکت"],
            ["Enter", "بارگذاری در سبد"],
            ["Esc", "بستن"],
          ] as [string, string][]
        ).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]">
              {k}
            </kbd>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** «۳ ساعت مانده» — دقیقه‌ی خام برای فروشنده معنی ندارد. */
function remaining(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes <= 0) return "منقضی";
  if (minutes < 60) return `${toFa(minutes)} دقیقه`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${toFa(h)} ساعت`;
  return `${toFa(Math.floor(h / 24))} روز`;
}
