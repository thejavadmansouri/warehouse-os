"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/states";
import { getProductKardex } from "@/lib/api";
import { money, qty, faDate, formatDateTime, toFa } from "@/lib/format";
import {
  PRESETS,
  presetDates,
  ExportButton,
  Pagination,
  type PresetRange,
} from "../../reports/_components/shared";

import { KardexTable } from "@/components/kardex-table";
import type { InventoryAction } from "@/lib/types";

/** برچسب فارسی نوع حرکت — بک‌اند فقط enum خام می‌دهد. */
const ACTION_LABELS: Record<InventoryAction, string> = {
  IN: "ورود",
  OUT: "خروج",
  SALE: "فروش",
  RETURN: "برگشت",
  TRANSFER: "انتقال",
  ADJUST: "اصلاح",
  COUNT: "شمارش",
};

/** نوع‌هایی که در فیلترِ کاردکس می‌آیند — COUNT هرگز لاگ نمی‌شود. */
const KARDEX_FILTER_ACTIONS: InventoryAction[] = [
  "IN",
  "OUT",
  "SALE",
  "RETURN",
  "TRANSFER",
  "ADJUST",
];

/** پیشوند سندِ منبعِ حرکت — کنارِ شمارهٔ سند نشان داده می‌شود. */
const DOC_LABELS: Record<"SALE" | "PURCHASE" | "RETURN" | "MANUAL", string> = {
  SALE: "فاکتور فروش",
  PURCHASE: "فاکتور خرید",
  RETURN: "مرجوعی",
  MANUAL: "دستی",
};

/**
 * کاردکس یک کالا — گردش ورود/خروج با مانده‌ی متحرک.
 *
 * پیش‌فرض «کل تاریخچه» است، نه «امروز»: مانده فقط وقتی معنا دارد که کل حرکت‌ها
 * دیده شود و مانده‌ی آخر با موجودی فعلی بخواند.
 */
export function ProductKardex({ productId }: { productId: string }) {
  const [preset, setPreset] = React.useState<PresetRange | "all">("all");
  const [action, setAction] = React.useState<InventoryAction | "">("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => setPage(1), [preset, action]);

  const dates = React.useMemo(
    () => (preset === "all" ? {} : presetDates(preset)),
    [preset],
  );
  const limit = 20;

  const q = useQuery({
    queryKey: ["kardex", productId, dates, action, page],
    queryFn: () =>
      getProductKardex(productId, {
        ...dates,
        action: action || undefined,
        page,
        limit,
      }),
    enabled: !!productId,
  });

  // نگاشتِ دادهٔ بک‌اند به شکلی که کامپوننت جدول انتظار دارد: افزودن برچسب
  // فارسی حرکت، و ساختِ متنِ سند («فاکتور فروش ۱۲۳») از docType + docNumber.
  const tableRows = React.useMemo(
    () =>
      (q.data?.rows.data ?? []).map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        actionLabel: ACTION_LABELS[r.action] ?? r.action,
        docType: r.docType,
        docNumber:
          r.docNumber != null ? `${DOC_LABELS[r.docType]} ${r.docNumber}` : null,
        // جزئیاتِ فاکتور فروش صفحه‌ی جدا دارد — بقیه‌ی سندها نه، پس فقط فروش لینک می‌شود.
        docHref:
          r.docType === "SALE" && r.docId
            ? `/admin/invoices/${r.docId}`
            : null,
        locationName: r.locationName,
        inQty: r.inQty,
        outQty: r.outQty,
        balance: r.balance,
        unitPrice: r.unitPrice,
      })),
    [q.data],
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          کاردکس (گردش کالا)
        </CardTitle>
        <div className="flex items-center gap-2">
          {q.data ? (
            <Badge variant="secondary" className="tabular-nums">
              موجودی فعلی: {qty(q.data.currentStock)}
            </Badge>
          ) : null}
          <ExportButton
            endpoint={`/inventory/kardex/${productId}`}
            params={{ ...dates, action: action || undefined }}
            fileName="کاردکس"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* بازه — «کل تاریخچه» به‌علاوه‌ی presetهای مشترک با گزارش‌ها */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={preset === "all" ? "default" : "outline"}
            onClick={() => setPreset("all")}
          >
            کل تاریخچه
          </Button>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? "default" : "outline"}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as InventoryAction | "")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="فیلتر نوع حرکت"
          >
            <option value="">همه‌ی حرکت‌ها</option>
            {KARDEX_FILTER_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>

        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <>
            <KardexTable
              rows={tableRows}
              money={money}
              qty={qty}
              faDate={faDate}
              faDateTime={formatDateTime}
              toFa={toFa}
              summary={q.data?.summary}
            />
            <Pagination
              page={page}
              lastPage={q.data!.rows.meta.lastPage}
              onChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
