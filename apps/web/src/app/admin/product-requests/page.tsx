"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import {
  approveProductRequest,
  getCategories,
  getProductRequests,
  rejectProductRequest,
} from "@/lib/api";
import type { ApproveProductRequestDto, ProductCreationRequest } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Edit = {
  name: string;
  brandName: string;
  categoryId: string;
  vehicles: string; // comma-separated for editing
  quantity: number;
  unit: string;
};

const STATUSES = [
  { value: "all", label: "همه" },
  { value: "PENDING", label: "در انتظار بررسی" },
  { value: "APPROVED", label: "تأیید شده" },
  { value: "REJECTED", label: "رد شده" },
];

const NONE = "__none__";

function statusVariant(s: string): "secondary" | "default" | "destructive" {
  if (s === "APPROVED") return "default";
  if (s === "REJECTED") return "destructive";
  return "secondary";
}

function statusLabel(s: string): string {
  return s === "APPROVED" ? "تأیید شده" : s === "REJECTED" ? "رد شده" : "در انتظار بررسی";
}

/**
 * وقتی داخلِ کارتابل رندر می‌شود سرتیترِ خودش را نشان نمی‌دهد — کارتابل یک
 * سرتیتر دارد و تب‌ها زیرش می‌نشینند.
 */
export function ProductRequestsPanel({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [status, setStatus] = React.useState<string>("PENDING");
  const [edits, setEdits] = React.useState<Record<string, Edit>>({});
  const [rejectTarget, setRejectTarget] = React.useState<ProductCreationRequest | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["product-requests", status],
    queryFn: () => getProductRequests(status),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });

  function editFor(req: ProductCreationRequest): Edit {
    return (
      edits[req.id] ?? {
        name: req.name,
        brandName: req.brandName ?? "",
        categoryId: req.categoryId ?? "",
        vehicles: (req.vehicles ?? []).join("، "),
        quantity: req.quantity,
        unit: req.unit,
      }
    );
  }
  function setEdit(id: string, patch: Partial<Edit>, base: Edit) {
    setEdits((prev) => ({ ...prev, [id]: { ...base, ...patch } }));
  }

  const approveMut = useMutation({
    mutationFn: (vars: { id: string; body: ApproveProductRequestDto }) =>
      approveProductRequest(vars.id, vars.body),
    onSuccess: () => {
      toast({ title: "تأیید شد", description: "کالا ساخته و موجودی ثبت شد." });
      qc.invalidateQueries({ queryKey: ["product-requests"] });
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
      rejectProductRequest(vars.id, { reviewNote: vars.note }),
    onSuccess: () => {
      toast({ title: "رد شد" });
      qc.invalidateQueries({ queryKey: ["product-requests"] });
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

  function approve(req: ProductCreationRequest) {
    const e = editFor(req);
    setBusyId(req.id);
    approveMut.mutate({
      id: req.id,
      body: {
        name: e.name.trim(),
        brandName: e.brandName.trim() || undefined,
        categoryId: e.categoryId || undefined,
        vehicles: e.vehicles.split(/[،,]/).map((v) => v.trim()).filter(Boolean),
        quantity: e.quantity,
        unit: e.unit.trim() || undefined,
      },
    });
  }

  const requests = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        compact={embedded}
        title="درخواست‌های افزودن کالا"
        description="کالاهایی که کارگر درخواست افزودن آن‌ها را داده است. تأیید = ساخت کالا و ثبت موجودی."
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : requests.length === 0 ? (
        <EmptyState title="درخواستی برای نمایش نیست" />
      ) : (
        <div className="grid gap-4">
          {requests.map((req) => {
            const e = editFor(req);
            const pending = req.status === "PENDING";
            const busy = busyId === req.id;
            return (
              <Card key={req.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {req.location?.warehouse?.name ?? "انبار نامشخص"}
                  </CardTitle>
                  <Badge variant={statusVariant(req.status)}>{statusLabel(req.status)}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>نام کالا</Label>
                      <Input
                        value={e.name}
                        disabled={!pending}
                        onChange={(ev) => setEdit(req.id, { name: ev.target.value }, e)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>برند</Label>
                      <Input
                        value={e.brandName}
                        disabled={!pending}
                        onChange={(ev) => setEdit(req.id, { brandName: ev.target.value }, e)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>دسته‌بندی</Label>
                      <Select
                        value={e.categoryId || NONE}
                        disabled={!pending}
                        onValueChange={(v) => setEdit(req.id, { categoryId: v === NONE ? "" : v }, e)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="انتخاب دسته‌بندی" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>بدون دسته‌بندی</SelectItem>
                          {(categories ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>مناسب برای خودرو (با ویرگول جدا کنید)</Label>
                      <Input
                        value={e.vehicles}
                        disabled={!pending}
                        placeholder="پژو ۲۰۶، پژو ۴۰۵"
                        onChange={(ev) => setEdit(req.id, { vehicles: ev.target.value }, e)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>تعداد</Label>
                      <Input
                        type="number"
                        min={1}
                        value={e.quantity}
                        disabled={!pending}
                        onChange={(ev) =>
                          setEdit(req.id, { quantity: Math.max(1, Number(ev.target.value) || 1) }, e)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>واحد</Label>
                      <Input
                        value={e.unit}
                        disabled={!pending}
                        onChange={(ev) => setEdit(req.id, { unit: ev.target.value }, e)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted-foreground">درخواست‌کننده</div>
                      <div className="font-medium">
                        {req.worker?.fullName || req.worker?.username || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">موقعیت</div>
                      <div className="font-medium">
                        {req.location?.path || req.location?.name || req.locationBarcode || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">زمان درخواست</div>
                      <div className="font-medium">{formatDateTime(req.createdAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">تعداد درخواستی</div>
                      <div className="font-medium">
                        {formatNumber(req.quantity)} {req.unit}
                      </div>
                    </div>
                  </div>

                  {req.voiceText ? (
                    <div className="rounded-md bg-muted/50 p-3">
                      <div className="text-xs text-muted-foreground">متن گفته‌شده</div>
                      <div className="text-sm">«{req.voiceText}»</div>
                    </div>
                  ) : null}

                  {req.status === "REJECTED" && req.reviewNote ? (
                    <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                      دلیل رد: {req.reviewNote}
                    </div>
                  ) : null}
                  {req.status === "APPROVED" && req.createdProduct ? (
                    <div className="rounded-md border p-3 text-sm">
                      کالای ساخته‌شده: {req.createdProduct.name} (SKU: {req.createdProduct.sku})
                    </div>
                  ) : null}

                  {pending ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={() => approve(req)} disabled={busy || !e.name.trim()}>
                        <CheckCircle2 className="ml-1 size-4" />
                        تأیید و ساخت کالا
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() => {
                          setRejectTarget(req);
                          setRejectNote("");
                        }}
                      >
                        <XCircle className="ml-1 size-4" />
                        رد درخواست
                      </Button>
                    </div>
                  ) : null}
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
            <DialogTitle>رد درخواست افزودن کالا</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">دلیل رد را وارد کنید (اختیاری):</div>
            <Textarea
              value={rejectNote}
              onChange={(ev) => setRejectNote(ev.target.value)}
              placeholder="مثلاً: محصول تکراری است…"
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
              رد درخواست
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی و بوکمارک‌ها نباید بشکنند. */
export default function ProductRequestsPage() {
  return <ProductRequestsPanel />;
}
