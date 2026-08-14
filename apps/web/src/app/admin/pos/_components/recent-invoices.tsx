"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Ban, Eye, Loader2, Printer, Undo2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money";
import { cancelInvoice, getInvoice, getInvoices } from "@/lib/api";
import { money, toFa, rial } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { ReturnDialog } from "./return-dialog";

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
  const [viewing, setViewing] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);

  /*
   * ردیف‌های فاکتور در لیست نیستند (لیست سبک است)، پس برای «مشاهده» جزئیات
   * جدا گرفته می‌شود. همان‌جا داخل پنجره باز می‌شود نه در تب جدید — فروشنده
   * معمولاً فقط می‌خواهد بداند داخلش چه بوده و برگردد.
   */
  const detail = useQuery({
    queryKey: ["invoice", viewing],
    queryFn: () => getInvoice(viewing!),
    enabled: !!viewing,
  });

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
      qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] });
    },
    onError: () => toast.error("باطل‌کردن فاکتور ناموفق بود"),
  });

  const rows = invoices.data?.data ?? [];

  return (
    <>
    {/* وقتی مرجوعی باز است این پنجره جمع می‌شود تا پنجره‌روی‌پنجره نشود؛ بعد از
        بستنِ مرجوعی دوباره برمی‌گردد. onClose فقط وقتی صدا زده می‌شود که کاربر
        خودش ببندد، نه وقتی برای مرجوعی موقتاً جمع شده. */}
    <Dialog
      open={open && !returning}
      onOpenChange={(v) => { if (!v && !returning) onClose(); }}
    >
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="text-base">فاکتورهای امروز</DialogTitle>
        </DialogHeader>

        {viewing ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setViewing(null)}
            >
              <ArrowRight className="size-4" /> بازگشت به فهرست
            </Button>

            {detail.isLoading && (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
              </p>
            )}

            {detail.data && (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
                  <Field label="شماره" value={toFa(detail.data.number)} />
                  <Field
                    label="مشتری"
                    value={detail.data.customer?.fullName ?? "نقدی گذری"}
                  />
                  <Field label="مبلغ" value={money(detail.data.total)} />
                  <Field
                    label="مانده"
                    value={money(detail.data.dueAmount)}
                    tone={detail.data.dueAmount > 0 ? "amber" : undefined}
                  />
                </div>

                <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                      <tr className="text-muted-foreground">
                        <th className="p-2 text-start font-medium">کالا</th>
                        <th className="w-16 p-2 text-start font-medium">تعداد</th>
                        <th className="w-28 p-2 text-start font-medium">قیمت واحد</th>
                        <th className="w-28 p-2 text-end font-medium">جمع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.lines?.map((l) => (
                        <tr key={l.id} className="border-t">
                          <td className="p-2">
                            <div className="font-medium">{l.product?.name ?? "—"}</div>
                            {l.location?.path && (
                              <div className="text-xs text-sky-700 dark:text-sky-400">
                                {l.location.path}
                              </div>
                            )}
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
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={() =>
                      window.open(`/admin/print/invoice/${detail.data!.id}`, "_blank")
                    }
                  >
                    <Printer className="size-4" /> چاپ
                  </Button>
                  {detail.data.status !== "CANCELLED" && (
                    <Button
                      variant="outline"
                      className="w-fit"
                      onClick={() => setReturning(detail.data!.id)}
                    >
                      <Undo2 className="size-4" /> مرجوعی
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
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
                    <th className="w-52 p-2" />
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
                          <span className="inline-flex items-center gap-2">
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
                        <td className="max-w-40 truncate p-2">
                          {inv.customer?.fullName ?? "نقدی گذری"}
                        </td>
                        <td className="p-2"><Money value={inv.total} /></td>
                        <td className="p-2">
                          {inv.dueAmount > 0 ? (
                            <Money value={inv.dueAmount} tone="due" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            {/* چاپ مجدد — برای فاکتور باطل‌شده هم لازم است. */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="چاپ فاکتور"
                              onClick={() =>
                                window.open(`/admin/print/invoice/${inv.id}`, "_blank")
                              }
                            >
                              <Printer className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewing(inv.id)}
                            >
                              <Eye className="size-3.5" />
                              <span className="ms-1 text-xs">مشاهده</span>
                            </Button>
                            {!cancelled && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setReturning(inv.id)}
                                >
                                  <Undo2 className="size-3.5 text-amber-600" />
                                  <span className="ms-1 text-xs">مرجوعی</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCancelling(inv)}
                                >
                                  <Ban className="size-3.5 text-destructive" />
                                  <span className="ms-1 text-xs">ابطال</span>
                                </Button>
                              </>
                            )}
                          </div>
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

    {/* بیرون از DialogContent تا پنجره‌روی‌پنجره نشود؛ RecentInvoices خودش هنگام
        بازبودنِ مرجوعی جمع می‌شود. */}
    <ReturnDialog
      invoiceId={returning}
      onClose={() => setReturning(null)}
      onDone={() => qc.invalidateQueries({ queryKey: ["pos-recent-invoices"] })}
    />

    <ConfirmDialog
      open={!!cancelling}
      onOpenChange={(v) => { if (!v) setCancelling(null); }}
      title={cancelling ? `ابطال فاکتور ${toFa(cancelling.number)}؟` : "ابطال فاکتور؟"}
      description={
        cancelling
          ? `مبلغ ${rial(cancelling.total)} — موجودی کالاها به انبار برمی‌گردد. این کار برگشت‌ناپذیر است.`
          : undefined
      }
      destructive
      requireReason
      reasonPlaceholder="دلیل ابطال (اجباری) — مثلاً: مشتری منصرف شد"
      confirmText="بله، باطل کن"
      loading={doCancel.isPending}
      onConfirm={(reason) =>
        cancelling && doCancel.mutate({ id: cancelling.id, reason: reason ?? "" })
      }
    />
    </>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber";
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-semibold tabular-nums ${
          tone === "amber" ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
