"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import {
  approvePendingOperation,
  getPendingOperations,
  rejectPendingOperation,
} from "@/lib/api";
import type { PendingOperation, Product } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ProductSearchSelect } from "@/components/product-search-select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export default function ReviewPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [warehouseId, setWarehouseId] = React.useState<string>("all");
  const [overrides, setOverrides] = React.useState<
    Record<string, { id: string; name: string }>
  >({});
  const [rejectTarget, setRejectTarget] = React.useState<PendingOperation | null>(
    null
  );
  const [rejectNote, setRejectNote] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-operations"],
    queryFn: () => getPendingOperations(),
  });

  const warehouses = React.useMemo(() => {
    const map = new Map<string, string>();
    (data ?? []).forEach((op) => {
      const w = op.location?.warehouse;
      if (w) map.set(w.id, w.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [data]);

  const filtered = React.useMemo(() => {
    if (warehouseId === "all") return data ?? [];
    return (data ?? []).filter((op) => op.location?.warehouse?.id === warehouseId);
  }, [data, warehouseId]);

  const approveMut = useMutation({
    mutationFn: (vars: { id: string; productId?: string }) =>
      approvePendingOperation(
        vars.id,
        vars.productId ? { productId: vars.productId } : {}
      ),
    onSuccess: () => {
      toast({ title: "تأیید شد", description: "موجودی ثبت شد." });
      qc.invalidateQueries({ queryKey: ["pending-operations"] });
    },
    onError: (e: unknown) =>
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "تأیید ناموفق بود",
      }),
    onSettled: () => setBusyId(null),
  });

  const rejectMut = useMutation({
    mutationFn: (vars: { id: string; note: string }) =>
      rejectPendingOperation(vars.id, { reviewNote: vars.note }),
    onSuccess: () => {
      toast({ title: "رد شد" });
      qc.invalidateQueries({ queryKey: ["pending-operations"] });
      setRejectTarget(null);
      setRejectNote("");
    },
    onError: (e: unknown) =>
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof Error ? e.message : "رد کردن ناموفق بود",
      }),
    onSettled: () => setBusyId(null),
  });

  function approve(op: PendingOperation) {
    const override = overrides[op.id];
    setBusyId(op.id);
    approveMut.mutate({ id: op.id, productId: override?.id });
  }

  function productBarcode(op: PendingOperation): string {
    return (
      op.product?.internalBarcode ??
      op.product?.sku ??
      op.product?.barcodes?.[0]?.barcode ??
      "—"
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="بازبینی عملیات کارگر"
        description="عملیات ثبت‌شده توسط کارگر که در انتظار تأیید مدیر است. تأیید = ثبت واقعی موجودی."
        actions={
          warehouses.length > 0 ? (
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="همه‌ی انبارها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه‌ی انبارها</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="موردی برای بازبینی نیست" />
      ) : (
        <div className="grid gap-4">
          {filtered.map((op) => {
            const override = overrides[op.id];
            const productName = override?.name ?? op.product?.name ?? null;
            const confidence = op.parsed?.suggestions?.[0]?.confidence;
            const hasProduct = Boolean(override?.id ?? op.productId);
            const busy = busyId === op.id;

            return (
              <Card key={op.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {op.location?.warehouse?.name ?? "انبار نامشخص"}
                  </CardTitle>
                  <Badge variant="secondary">{op.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <Field label="کارگر">
                      {op.worker?.fullName || op.worker?.username || "—"}
                    </Field>
                    <Field label="زمان ثبت">{formatDateTime(op.createdAt)}</Field>
                    <Field label="نوع عملیات">{op.type}</Field>
                    <Field label="موقعیت">
                      {op.location?.path || op.location?.name || op.locationBarcode}
                    </Field>
                    <Field label="تعداد">
                      {formatNumber(op.quantity)}
                      {op.unit ? ` ${op.unit}` : ""}
                    </Field>
                    <Field label="اطمینان تشخیص">
                      {confidence != null ? `${Math.round(confidence)}%` : "—"}
                    </Field>
                    <Field label="محصول match‌شده">
                      {productName ? (
                        <>
                          {productName}
                          {op.product?.brand?.name ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {op.product.brand.name}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-destructive">مشخص نشده</span>
                      )}
                    </Field>
                    <Field label="بارکد / SKU">{productBarcode(op)}</Field>
                  </div>

                  {op.voiceText ? (
                    <div className="rounded-md bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground">
                        متن گفته‌شده
                      </div>
                      <div className="text-sm">«{op.voiceText}»</div>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      تغییر محصول (در صورت اشتباه بودن match)
                    </div>
                    <ProductSearchSelect
                      value={override?.id ?? op.productId ?? undefined}
                      onChange={(p: Product | null) =>
                        setOverrides((prev) => {
                          const next = { ...prev };
                          if (p) next[op.id] = { id: p.id, name: p.name };
                          else delete next[op.id];
                          return next;
                        })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      onClick={() => approve(op)}
                      disabled={busy || !hasProduct}
                    >
                      <CheckCircle2 className="ml-1 size-4" />
                      تأیید و ثبت موجودی
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setRejectTarget(op);
                        setRejectNote("");
                      }}
                      disabled={busy}
                    >
                      <XCircle className="ml-1 size-4" />
                      رد
                    </Button>
                    {!hasProduct ? (
                      <span className="self-center text-xs text-muted-foreground">
                        برای تأیید، ابتدا محصول را انتخاب کنید
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رد عملیات</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              دلیل رد را وارد کنید (ذخیره می‌شود):
            </div>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="مثلاً: محصول اشتباه، تعداد نادرست…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => {
                if (!rejectTarget) return;
                setBusyId(rejectTarget.id);
                rejectMut.mutate({ id: rejectTarget.id, note: rejectNote.trim() });
              }}
            >
              رد عملیات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
