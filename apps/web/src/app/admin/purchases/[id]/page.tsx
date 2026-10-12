"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, PackagePlus, Send } from "lucide-react";
import { toast } from "sonner";

import { dispatchPurchasePutaway, getPurchase } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money, qty as faQty, toFa } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";
import { uuid } from "@/lib/uuid";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingState, ErrorState } from "@/components/states";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PURCHASE_STATUS_LABELS, SUPPLIER_PAY_METHOD_LABELS } from "@/lib/types";
import { WorkerPicker } from "@/app/admin/pos/_components/worker-picker";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

const PUTAWAY_STATUS: Record<string, string> = {
  PENDING: "در انتظار",
  IN_PROGRESS: "در حال چیدن",
  COMPLETED: "تمام شده",
  CANCELLED: "لغو شده",
};

export default function PurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const purchaseQ = useQuery({
    queryKey: ["purchase", params.id],
    queryFn: () => getPurchase(params.id),
    enabled: canUse && !!params.id,
  });

  const dispatch = useMutation({
    mutationFn: (args: { assignedToIds: string[]; note: string }) =>
      dispatchPurchasePutaway(params.id, {
        idempotencyKey: uuid(),
        assignedToIds: args.assignedToIds.length ? args.assignedToIds : undefined,
        note: args.note.trim() || undefined,
      }),
    onSuccess: async (task) => {
      await qc.invalidateQueries({ queryKey: ["purchase", params.id] });
      void qc.invalidateQueries({ queryKey: ["work-tasks"] });
      setPickerOpen(false);
      toast.success(
        `کار چیدن با ${toFa(task.totalItems)} قلم برای کارگر ارسال شد`,
      );
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiException ? e.message : "ارسال برای چیدن ناموفق بود",
      ),
  });

  if (!canUse) {
    return <Card className="p-6 text-center text-muted-foreground">این بخش فقط برای مدیر است.</Card>;
  }

  if (purchaseQ.isLoading) return <LoadingState />;
  if (purchaseQ.isError || !purchaseQ.data) {
    return <ErrorState message="بارگذاری فاکتور خرید ناموفق بود." onRetry={() => purchaseQ.refetch()} />;
  }

  const p = purchaseQ.data;
  const lines = p.lines ?? [];
  const putawayTasks = p.putawayTasks ?? [];
  const activePutaway = putawayTasks.find((t) => t.status !== "CANCELLED");
  const stagingCount = lines.filter(
    (l) => l.location?.code?.startsWith("SYS-STAGE-") || l.location?.name === "انبار موقت",
  ).length;
  const canDispatch =
    p.status === "CONFIRMED" && !activePutaway && stagingCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`جزئیات فاکتور خرید ${toFa(p.number)}`}
        description="اقلام، قیمت خرید، مکان ورود و اطلاعات سند"
        icon={PackagePlus}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canDispatch ? (
              <Button onClick={() => setPickerOpen(true)}>
                <Send className="me-2 h-4 w-4" />
                ارسال به کارگر برای چیدن
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/admin/purchases">
                <ArrowRight className="me-2 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="تاریخ" value={formatJalali(new Date(p.invoiceDate ?? p.createdAt))} />
        <Info
          label="تأمین‌کننده"
          value={
            p.supplier?.id ? (
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/admin/suppliers/${p.supplier.id}`}
              >
                {p.supplier.name}
              </Link>
            ) : (
              "مشخص نشده"
            )
          }
        />
        <Info label="شماره فاکتور فروشنده" value={p.supplierRef ?? "—"} />
        <Info
          label="نحوه تسویه"
          value={p.payMethod ? SUPPLIER_PAY_METHOD_LABELS[p.payMethod] : "—"}
        />
        <Info
          label="سررسید پرداخت"
          value={p.dueDate ? formatJalali(new Date(p.dueDate)) : "—"}
        />
        <Info label="وضعیت" value={<Badge variant={p.status === "CANCELLED" ? "destructive" : "secondary"}>{PURCHASE_STATUS_LABELS[p.status] ?? p.status}</Badge>} />
      </Card>

      {putawayTasks.length > 0 ? (
        <Card className="space-y-3 p-4">
          <div className="text-sm font-semibold">کار چیدن</div>
          {putawayTasks.map((t) => {
            const names =
              (t.assignees?.length
                ? t.assignees.map((a) => a.fullName)
                : t.assignedTo
                  ? [t.assignedTo.fullName]
                  : ["هر کارگر آزاد"]);
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <Badge variant="secondary">{PUTAWAY_STATUS[t.status] ?? t.status}</Badge>
                  <span className="ms-2 text-muted-foreground">
                    {names.join("، ")}
                  </span>
                </div>
                <div className="tabular-nums text-muted-foreground">
                  {toFa(t.doneItems)} / {toFa(t.totalItems)} قلم
                </div>
              </div>
            );
          })}
        </Card>
      ) : canDispatch ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div>
            <div className="font-medium">{toFa(stagingCount)} قلم روی انبار موقت</div>
            <div className="text-muted-foreground">
              بار رسیده؟ برای چیدن به یک یا چند کارگر بفرستید — هر کس هر قلمی را
              گذاشت تیک می‌زند.
            </div>
          </div>
          <Button onClick={() => setPickerOpen(true)}>
            <Send className="me-2 h-4 w-4" />
            ارسال به کارگر
          </Button>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader><TableRow><TableHead>ردیف</TableHead><TableHead>کالا</TableHead><TableHead>کد</TableHead><TableHead>مکان</TableHead><TableHead>تعداد</TableHead><TableHead>قیمت واحد</TableHead><TableHead>جمع</TableHead></TableRow></TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const net = Math.max(0, (line.quantity * (line.unitPrice ?? 0)));
              return <TableRow key={line.id}>
                <TableCell>{toFa(index + 1)}</TableCell>
                <TableCell className="font-medium">{line.product?.name ?? "محصول حذف‌شده"}</TableCell>
                <TableCell>{line.product?.sku ?? "—"}</TableCell>
                <TableCell>{line.location?.path ?? line.location?.name ?? "انبار موقت"}</TableCell>
                <TableCell>{faQty(line.quantity)} {line.product?.unit ?? ""}</TableCell>
                <TableCell>{money(line.unitPrice ?? 0)}</TableCell>
                <TableCell>{money(net)}</TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="ms-auto w-full max-w-sm space-y-2 p-4 text-sm">
        <Summary label="جمع اقلام" value={money(p.subtotal)} />
        <Summary label="تخفیف" value={money(p.discount)} />
        <Summary label="مبلغ نهایی" value={money(p.total)} strong />
        {p.note ? <div className="border-t pt-2 text-muted-foreground">یادداشت: {p.note}</div> : null}
      </Card>

      <WorkerPicker
        open={pickerOpen}
        itemCount={stagingCount || lines.length}
        pending={dispatch.isPending}
        title="ارسال برای چیدن"
        onPick={(ids, note) => dispatch.mutate({ assignedToIds: ids, note })}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "border-t pt-2 text-base font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
