"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Printer,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money";
import { getInvoice, getInvoices } from "@/lib/api";
import { money, toFa } from "@/lib/format";
import type { Customer } from "@/lib/types";

/** ابتدای امروز به‌صورت ISO — سرور `from` را به‌عنوان تاریخ می‌گیرد. */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * خریدهای امروزِ مشتریِ جاری — از همان چیپ صندوق باز می‌شود.
 *
 * وقتی مشتریِ حساب‌باز برمی‌گردد («صبح خریدم، ببینم چی خریدم») فروشنده نباید
 * برود صفحه‌ی پرونده یا F10 را باز کند و فیلتر ذهنی بزند؛ همین‌جا، از اول روز
 * تا حالا، همه‌ی فاکتورهایش با اقلام بازشونده دیده می‌شود. داده از همان دو
 * endpointِ صندوق می‌آید (فهرست + جزئیات) — بدون هیچ تغییر بک‌اند.
 */
export function TodayPurchasesDialog({
  open,
  customer,
  onClose,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        {/* با بستن، Body unmount می‌شود و ردیفِ بازشده برای بازِ بعدی ریست می‌شود. */}
        {open && customer && <TodayPurchasesBody customer={customer} />}
      </DialogContent>
    </Dialog>
  );
}

function TodayPurchasesBody({ customer }: { customer: Customer }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["customer-today-invoices", customer.id],
    queryFn: () =>
      getInvoices({ customerId: customer.id, from: startOfToday(), pageSize: 50 }),
    // هر بار که باز می‌شود تازه بگیر — پشت پیشخوان فروش سریع است.
    staleTime: 0,
  });

  const detail = useQuery({
    queryKey: ["invoice", expandedId],
    queryFn: () => getInvoice(expandedId!),
    enabled: !!expandedId,
  });

  const rows = list.data?.data ?? [];
  // باطل‌شده پول‌اش برگشته — در جمعِ «خرید امروز» نمی‌آید.
  const total = rows
    .filter((r) => r.status !== "CANCELLED")
    .reduce((s, r) => s + r.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle className="text-base">
          خریدهای امروزِ {customer.fullName}
        </DialogTitle>
      </DialogHeader>

      {list.isLoading ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          امروز هنوز خریدی برای این مشتری ثبت نشده
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="tabular-nums">{toFa(rows.length)} فاکتور</span>
            <span>
              مجموع خرید امروز:{" "}
              <span className="font-bold tabular-nums">{money(total)}</span>
            </span>
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-muted-foreground">
                  <th className="p-2 text-start font-medium">شماره</th>
                  <th className="p-2 text-start font-medium">ساعت</th>
                  <th className="w-32 p-2 text-end font-medium">مبلغ</th>
                  <th className="w-28 p-2 text-end font-medium">مانده</th>
                  <th className="w-12 p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const cancelled = inv.status === "CANCELLED";
                  const expanded = expandedId === inv.id;
                  return (
                    <FragmentRow
                      key={inv.id}
                      inv={inv}
                      cancelled={cancelled}
                      expanded={expanded}
                      detail={detail}
                      onToggle={() => setExpandedId(expanded ? null : inv.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/admin/customers/${customer.id}`, "_blank")}
        >
          <ExternalLink className="size-4" /> پرونده‌ی کامل
        </Button>
        <p className="text-xs text-muted-foreground">Esc برای بستن</p>
      </div>
    </div>
  );
}

function FragmentRow({
  inv,
  cancelled,
  expanded,
  detail,
  onToggle,
}: {
  inv: { id: string; number: number; createdAt: string; total: number; dueAmount: number; status: string };
  cancelled: boolean;
  expanded: boolean;
  detail: { isLoading: boolean; data?: { lines: { id: string; quantity: number; unitPrice?: number | null; lineDiscount?: number | null; product?: { name?: string } | null; location?: { path?: string | null } | null }[] } | null };
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t transition-colors ${
          cancelled ? "opacity-60" : ""
        } ${expanded ? "bg-muted/40" : "hover:bg-muted/30"}`}
      >
        <td className="p-2 font-medium tabular-nums">
          <span className="inline-flex items-center gap-2">
            {expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {toFa(inv.number)}
            {cancelled && <StatusBadge kind="invoice" status="CANCELLED" />}
          </span>
        </td>
        <td className="p-2 tabular-nums text-muted-foreground">
          {toFa(
            new Date(inv.createdAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })
          )}
        </td>
        <td className="p-2 text-end">
          <Money value={inv.total} />
        </td>
        <td className="p-2 text-end">
          {inv.dueAmount > 0 ? (
            <Money value={inv.dueAmount} tone="due" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="p-2 text-end">
          {/* چاپ مجدد — برای فاکتور باطل‌شده هم لازم است. */}
          <Button
            variant="ghost"
            size="sm"
            title="چاپ فاکتور"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`/admin/print/invoice/${inv.id}`, "_blank");
            }}
          >
            <Printer className="size-3.5" />
          </Button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={5} className="p-0">
            {detail.isLoading ? (
              <p className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> در حال بارگذاری اقلام…
              </p>
            ) : detail.data ? (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-muted-foreground">
                    <th className="p-2 text-start font-medium">کالا</th>
                    <th className="p-2 text-start font-medium">مکان</th>
                    <th className="w-16 p-2 text-start font-medium">تعداد</th>
                    <th className="w-28 p-2 text-end font-medium">قیمت واحد</th>
                    <th className="w-28 p-2 text-end font-medium">جمع</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 font-medium">{l.product?.name ?? "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {l.location?.path ?? ""}
                      </td>
                      <td className="p-2 tabular-nums">{toFa(l.quantity)}</td>
                      <td className="p-2 tabular-nums">{money(l.unitPrice ?? 0)}</td>
                      <td className="p-2 text-end font-semibold tabular-nums">
                        {money((l.unitPrice ?? 0) * l.quantity - (l.lineDiscount ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}
