"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelInvoice, getInvoices } from "@/lib/api";
import { money, toFa, toman } from "@/lib/format";
import type { Invoice } from "@/lib/types";

/** ابتدای امروز به‌صورت ISO — سرور `from` را به‌عنوان تاریخ می‌گیرد. */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * فاکتورهای امروزِ همین انبار + باطل‌کردن.
 *
 * فروشنده باید بتواند اشتباهش را همان‌جا برگرداند. باطل‌کردن موجودی را برمی‌گرداند
 * (کار سرور است)، برای همین دلیل اجباری است و در فاکتور ثبت می‌شود.
 */
export function RecentInvoices({
  open,
  warehouseId,
  onClose,
}: {
  open: boolean;
  warehouseId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<Invoice | null>(null);
  const [reason, setReason] = useState("");

  const invoices = useQuery({
    queryKey: ["pos-recent-invoices", warehouseId],
    queryFn: () =>
      getInvoices({ warehouseId, from: startOfToday(), pageSize: 50 }),
    enabled: open && !!warehouseId,
    // فروش پشت پیشخوان سریع است — هر بار باز شد، تازه بگیر.
    staleTime: 0,
  });

  const doCancel = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      cancelInvoice(v.id, v.reason),
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} باطل شد — موجودی برگشت`);
      setCancelling(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
    },
    onError: () => toast.error("باطل‌کردن فاکتور ناموفق بود"),
  });

  const rows = invoices.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">فاکتورهای امروز</DialogTitle>
        </DialogHeader>

        {cancelling ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              فاکتور <span className="font-semibold">{toFa(cancelling.number)}</span> به مبلغ{" "}
              <span className="font-semibold">{toman(cancelling.total)}</span> باطل شود؟
            </p>
            <p className="text-xs text-muted-foreground">
              موجودی کالاهای این فاکتور به انبار برمی‌گردد. این کار برگشت‌پذیر نیست.
            </p>
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="دلیل ابطال (اجباری) — مثلاً: مشتری منصرف شد"
              className="h-10"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={!reason.trim() || doCancel.isPending}
                onClick={() =>
                  doCancel.mutate({ id: cancelling.id, reason: reason.trim() })
                }
              >
                {doCancel.isPending ? "در حال ابطال…" : "بله، باطل کن"}
              </Button>
              <Button
                variant="outline"
                disabled={doCancel.isPending}
                onClick={() => { setCancelling(null); setReason(""); }}
              >
                انصراف
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            {invoices.isLoading && (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
              </p>
            )}

            {!invoices.isLoading && rows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                امروز هنوز فاکتوری ثبت نشده
              </p>
            )}

            {rows.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-muted-foreground">
                    <th className="p-2 text-start font-medium">شماره</th>
                    <th className="p-2 text-start font-medium">ساعت</th>
                    <th className="p-2 text-start font-medium">مشتری</th>
                    <th className="p-2 text-start font-medium">مبلغ</th>
                    <th className="p-2 text-start font-medium">مانده</th>
                    <th className="w-24 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => {
                    const cancelled = inv.status === "CANCELLED";
                    return (
                      <tr
                        key={inv.id}
                        className={`border-t ${cancelled ? "opacity-50" : ""}`}
                      >
                        <td className="p-2 font-medium tabular-nums">
                          {toFa(inv.number)}
                          {cancelled && (
                            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              باطل
                            </span>
                          )}
                        </td>
                        <td className="p-2 tabular-nums text-muted-foreground">
                          {toFa(
                            new Date(inv.createdAt).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          )}
                        </td>
                        <td className="max-w-40 truncate p-2">
                          {inv.customer?.fullName ?? "نقدی گذری"}
                        </td>
                        <td className="p-2 tabular-nums">{money(inv.total)}</td>
                        <td className="p-2 tabular-nums">
                          {inv.dueAmount > 0 ? (
                            <span className="text-amber-600">{money(inv.dueAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          {!cancelled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelling(inv)}
                            >
                              <Ban className="size-3.5 text-destructive" />
                              <span className="ms-1 text-xs">ابطال</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
