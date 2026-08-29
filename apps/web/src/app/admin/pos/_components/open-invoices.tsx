"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { getInvoices } from "@/lib/api";
import { faDate, faTime, money, toFa } from "@/lib/format";

/**
 * فاکتورها — همان‌جا در صندوق.
 *
 * جای پنجره‌ی «فاکتورهای امروز» را گرفت. دو تفاوت که مهم‌اند: جست‌وجو دارد
 * (فقط امروز نیست — مشتری که هفته‌ی پیش خریده هم پیدا می‌شود)، و Enter
 * فاکتور را برای ویرایش داخل همین صفحه‌ی فروش می‌آورد به‌جای اینکه یک
 * پنجره‌ی اصلاحیه‌ی جدا باز کند.
 */
const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

export function OpenInvoices({
  open,
  warehouseId,
  onPick,
  onReturn,
  onClose,
}: {
  open: boolean;
  warehouseId: string;
  /** بارگذاری برای ویرایش — همان مسیرِ `?edit=`. */
  onPick: (invoiceId: string) => void;
  /** همان فاکتور، به‌عنوان سندِ برگشت از فروش. */
  onReturn: (invoiceId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [row, setRow] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setDebounced("");
    setRow(0);
  }, [open]);

  const list = useQuery({
    queryKey: ["pos-invoices-panel", warehouseId, debounced],
    queryFn: () =>
      getInvoices({
        warehouseId,
        q: debounced || undefined,
        // بدون جست‌وجو یعنی «امروز چه فروختیم» — پرتکرارترین سؤالِ پیشخوان.
        from: debounced ? undefined : startOfToday(),
        pageSize: 60,
      }),
    enabled: open && !!warehouseId,
    staleTime: 0,
  });

  const rows = list.data?.data ?? [];

  useEffect(() => setRow(0), [debounced]);

  useEffect(() => {
    document
      .querySelector('[data-invoices-panel] [data-active-row="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [row, rows.length]);

  if (!open) return null;

  return (
    <div
      data-invoices-panel
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
          case "PageDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 12, Math.max(rows.length - 1, 0)));
            return;
          case "PageUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 12, 0));
            return;
          case "Enter": {
            e.preventDefault();
            const inv = rows[row];
            if (!inv) return;
            if (e.altKey) onReturn(inv.id);
            else onPick(inv.id);
            return;
          }
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="شماره فاکتور، نام مشتری یا تلفن… (خالی = امروز)"
          className="h-9 flex-1 text-base"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {toFa(rows.length)} فاکتور
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {list.isFetching ? "…" : debounced ? "فاکتوری پیدا نشد" : "امروز هنوز فاکتوری ثبت نشده"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-20`}>شماره</th>
                <th className={`${TH} w-24`}>تاریخ</th>
                <th className={`${TH} w-16`}>ساعت</th>
                <th className={TH}>مشتری</th>
                <th className={`${TH} w-28`}>وضعیت</th>
                <th className={`${TH} w-36`}>مبلغ</th>
                <th className={`${TH} w-36`}>مانده</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv, i) => (
                <tr
                  key={inv.id}
                  data-active-row={i === row}
                  onMouseEnter={() => setRow(i)}
                  onClick={() => onPick(inv.id)}
                  title="باز کردن این فاکتور برای ویرایش"
                  className={`cursor-pointer border-b odd:bg-muted/25 ${
                    inv.status === "CANCELLED" ? "opacity-60" : ""
                  }`}
                >
                  <td className={`${TD} font-bold tabular-nums`}>{toFa(inv.number)}</td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faDate(inv.createdAt)}
                  </td>
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {faTime(inv.createdAt)}
                  </td>
                  <td className={`${TD} max-w-0 truncate`}>
                    {inv.customer?.fullName ?? "نقدی گذری"}
                  </td>
                  <td className={TD}>
                    <StatusBadge kind="invoice" status={inv.status} />
                  </td>
                  <td className={`${TD} text-end font-semibold tabular-nums`}>
                    {money(inv.total)}
                  </td>
                  <td
                    className={`${TD} text-end font-bold tabular-nums ${
                      inv.dueAmount > 0 ? "text-warning" : "text-muted-foreground"
                    }`}
                  >
                    {inv.dueAmount > 0 ? money(inv.dueAmount) : "—"}
                  </td>
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
            ["Enter", "ویرایش در همین صفحه"],
            ["Alt+Enter", "برگشت از فروش"],
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

/** ابتدای امروز به‌صورت ISO — سرور `from` را به‌عنوان تاریخ می‌گیرد. */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
