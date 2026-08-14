"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getOpenAccounts } from "@/lib/api";
import { faDate, money, toFa } from "@/lib/format";
import type { Debtor } from "@/lib/types";

/**
 * فهرست حساب‌های باز — جایگزین دکمه‌ی «جست‌وجوی کالا».
 *
 * فروشنده از این پنجره مشتری را برمی‌دارد و مستقیم می‌رود سراغ فروش. ترتیب
 * از سمت سرور می‌آید (معوق اول)، پس اینجا دوباره مرتب نمی‌شود — همان جایی که
 * مرتب‌سازی دوم شروع می‌شود، همان جایی است که دو صفحه دو ترتیب می‌گیرند.
 */
export function OpenAccounts({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (d: Debtor) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setDebounced("");
      setOnlyOverdue(false);
    }
  }, [open]);

  const list = useQuery({
    queryKey: ["open-accounts", debounced, onlyOverdue],
    queryFn: () => getOpenAccounts({ q: debounced, onlyOverdue, limit: 100 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const totalDue = rows.reduce((s, r) => s + r.totalDue, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">حساب‌های باز</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام مشتری…"
            className="h-10 flex-1"
          />
          <button
            type="button"
            onClick={() => setOnlyOverdue((v) => !v)}
            className={`h-10 shrink-0 rounded-md border px-3 text-sm font-medium transition-colors ${
              onlyOverdue
                ? "border-destructive bg-destructive text-white"
                : "hover:border-destructive hover:text-destructive"
            }`}
          >
            فقط معوق
          </button>
        </div>

        <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {toFa(rows.length)} مشتری با حساب باز
          </span>
          <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {money(totalDue)} ریال
          </span>
        </div>

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {rows.length === 0 && !list.isFetching && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {onlyOverdue ? "بدهی معوقی نیست" : "هیچ حساب بازی نیست"}
            </p>
          )}

          {rows.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d)}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-right
                         transition-colors hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.fullName}</span>
                <span className="block text-xs text-muted-foreground" dir="ltr">
                  {d.phone ? toFa(d.phone) : "بدون شماره"}
                </span>
              </span>

              {/* وضعیت با رنگ، نه با متن — از دو متر آن‌طرف‌تر هم خوانده می‌شود. */}
              <span className="shrink-0 text-end">
                <span
                  className={`block text-base font-bold tabular-nums ${
                    d.overdue > 0
                      ? "text-destructive"
                      : d.dueToday > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-foreground"
                  }`}
                >
                  {money(d.totalDue)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {d.overdue > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="size-3" />
                      معوق {money(d.overdue)}
                    </span>
                  ) : d.dueToday > 0 ? (
                    "سررسید امروز"
                  ) : d.nextDueDate ? (
                    `سررسید ${faDate(d.nextDueDate)}`
                  ) : (
                    "بدون سررسید"
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
