"use client";

// صفِ سفارش‌های اینترنتی در پنل.
//
// اینجا «پنلِ تأیید/رد» است: فروشنده سفارشِ سایت را می‌بیند، با «مرحله‌ی بعد»
// جلو می‌برد (آماده‌سازی → ارسال → تحویل) و اگر جنس نبود/مشتری پشیمان شد با دلیل
// لغو می‌کند. سفارشِ تازه خودش قطعی است (سرور موقع پایین‌آوردن فاکتورِ داخلی را
// صادر کرده)؛ این صفحه تصمیمِ تحویل را می‌گیرد نه تصمیمِ «بپذیرم یا نه».
import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Ban, ChevronRight, PackageCheck, Phone } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import {
  advanceOnlineOrder,
  cancelOnlineOrder,
  getOnlineOrder,
  getShopSettings,
  listOnlineOrders,
} from "@/lib/api";
import { convert, unitLabel, type CurrencyUnit } from "@/lib/currency";
import { faDateTime, toFa } from "@/lib/format";
import type {
  OnlineOrderDetail,
  OnlineOrderStatus,
} from "@/lib/types";

const STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  PLACED: "ثبت سفارش",
  PREPARING: "آماده‌سازی",
  SHIPPED: "ارسال شد",
  DELIVERED: "تحویل شد",
  CANCELLED: "لغو شده",
};

const STATUS_CLASS: Record<OnlineOrderStatus, string> = {
  PLACED: "bg-sky-100 text-sky-700",
  PREPARING: "bg-amber-100 text-amber-700",
  SHIPPED: "bg-violet-100 text-violet-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

const PAY_LABELS: Record<string, string> = {
  ON_DELIVERY: "پرداخت در محل",
  TRANSFER: "کارت‌به‌کارت",
  GATEWAY: "درگاه",
};

/** برچسبِ «مرحله‌ی بعد» برای هر وضعیتِ فعال. */
const NEXT_LABEL: Partial<Record<OnlineOrderStatus, string>> = {
  PLACED: "شروع برداشت",
  PREPARING: "ارسال شد",
  SHIPPED: "تحویل شد",
};

/** وضعیت‌هایی که هنوز می‌شوند لغو کرد. */
const CANCELABLE: OnlineOrderStatus[] = ["PLACED", "PREPARING", "SHIPPED"];

export const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
export const TD = "px-2 py-1.5 whitespace-nowrap";

/**
 * مبلغِ سفارش آنلاین به واحدِ نمایشِ پنل.
 *
 * سفارش به **واحدِ سایت** ذخیره می‌شود (سرور موقعِ ثبت آن را به `siteUnit`
 * تبدیل کرده)، در حالی که پنل به `panelUnit` نشان می‌دهد. پس مقدار را دستی
 * از site → panel تبدیل می‌کنیم و عدد را خودمان قالب می‌زنیم — به `money()`
 * تکیه نمی‌کنیم چون آن یکی عدد را «واحدِ ذخیره» فرض می‌کند.
 */
function ShopUnits({ children }: { children: (s: { site: CurrencyUnit; panel: CurrencyUnit }) => React.ReactNode }) {
  const settings = useQuery({ queryKey: ["shop-settings"], queryFn: getShopSettings });
  const s = settings.data;
  return <>{children({ site: s?.siteUnit ?? "TOMAN", panel: s?.panelUnit ?? (s?.storedUnit ?? "TOMAN") })}</>;
}

function fmt(v: number, site: CurrencyUnit, panel: CurrencyUnit): string {
  const val = convert(v, site, panel);
  return `${toFa(Math.round(val).toLocaleString("en-US")).replace(/,/g, "٬")} ${unitLabel(panel)}`;
}

export default function OnlineOrdersPage() {
  const [status, setStatus] = React.useState<OnlineOrderStatus | "ALL">("ALL");

  const list = useQuery({
    queryKey: ["online-orders", status],
    queryFn: () => listOnlineOrders(status === "ALL" ? undefined : status),
  });

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="سفارش‌های آنلاین"
          description="سفارش‌هایی که از فروشگاه اینترنتی آمدند — تأییدِ تحویل یا لغو"
          icon={PackageCheck}
        />
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as OnlineOrderStatus | "ALL")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه</SelectItem>
            {(Object.keys(STATUS_LABELS) as OnlineOrderStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-background">
        {list.isLoading ? (
          <div className="space-y-1 p-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : list.isError ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            بارگیری ناموفق بود — صفحه را تازه کنید.
          </p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">هیچ سفارشی نیست</p>
        ) : (
          <ShopUnits>
            {({ site, panel }) => (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                  <tr>
                    <th className={`${TH} w-20`}>سفارش</th>
                    <th className={`${TH} w-24`}>وضعیت</th>
                    <th className={TH}>گیرنده</th>
                    <th className={`${TH} w-14 text-center`}>قلم</th>
                    <th className={TH}>آدرس</th>
                    <th className={`${TH} w-32`}>تاریخ</th>
                    <th className={`${TH} w-36 text-end`}>مبلغ</th>
                    <th className={`${TH} w-44 text-end`}>اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((o) => (
                    <OrderRow key={o.id} id={o.id} site={site} panel={panel} />
                  ))}
                </tbody>
              </table>
            )}
          </ShopUnits>
        )}
      </div>
    </div>
  );
}

/** یک ردیف — با دکمه‌هایِ سریعِ «جلو» و «لغو» و بازشدنِ جزئیات. */
function OrderRow({ id, site, panel }: { id: string; site: CurrencyUnit; panel: CurrencyUnit }) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["online-order", id],
    queryFn: () => getOnlineOrder(id),
  });
  const [open, setOpen] = React.useState(false);

  const advance = useMutation({
    mutationFn: () => advanceOnlineOrder(id),
    onSuccess: () => {
      toast.success("وضعیت سفارش به‌روز شد");
      queryClient.invalidateQueries({ queryKey: ["online-orders"] });
      queryClient.invalidateQueries({ queryKey: ["online-order", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "مرحله به‌روز نشد"),
  });

  const cancel = useMutation({
    mutationFn: (reason?: string) => cancelOnlineOrder(id, reason),
    onSuccess: (r) => {
      toast.success("سفارش لغو شد");
      if (r.invoiceToCancel) {
        toast.info("فاکتور داخلیِ این سفارش باید جدا باطل شود — روی «فاکتور» در جزئیات بازش کنید");
      }
      queryClient.invalidateQueries({ queryKey: ["online-orders"] });
      queryClient.invalidateQueries({ queryKey: ["online-order", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "لغو ناموفق بود"),
  });

  const o = detail.data;
  const nextLabel = o ? NEXT_LABEL[o.status] : undefined;
  const cancelable = o ? CANCELABLE.includes(o.status) : false;

  return (
    <>
      <tr className="border-b odd:bg-muted/25 hover:bg-muted/40">
        <td className={TD}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-bold tabular-nums text-primary hover:underline"
          >
            #{toFa(detail.isLoading ? "…" : (o?.number ?? id.slice(0, 4)))}
          </button>
        </td>
        <td className={TD}>
          {o && (
            <Badge className={STATUS_CLASS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
          )}
        </td>
        <td className={`${TD} max-w-0 truncate font-medium`}>
          {o ? (
            <span className="flex items-center gap-1.5">
              <span className="truncate">{o.receiverName}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
                {o.receiverPhone}
              </span>
            </span>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
        </td>
        <td className={`${TD} text-center tabular-nums`}>
          {o ? toFa(o.lines.length) : "…"}
        </td>
        <td className={`${TD} max-w-0 truncate text-muted-foreground`}>
          {o?.address ?? "…"}
        </td>
        <td className={`${TD} tabular-nums text-muted-foreground`}>
          {o ? faDateTime(o.createdAt) : "…"}
        </td>
        <td className={`${TD} text-end font-bold tabular-nums`}>
          {o ? fmt(o.total, site, panel) : "…"}
        </td>
        <td className={`${TD} text-end`}>
          <div className="flex justify-end gap-1.5">
            {nextLabel && (
              <Button
                size="sm"
                onClick={() => advance.mutate()}
                disabled={advance.isPending}
                title={`مرحله‌ی بعد: ${nextLabel}`}
              >
                <ChevronRight className="size-4" aria-hidden />
                {nextLabel}
              </Button>
            )}
            {cancelable && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
                <Ban className="size-4" aria-hidden /> لغو
              </Button>
            )}
          </div>
        </td>
      </tr>

      {o && (
        <OrderDetailDialog
          order={o}
          open={open}
          onOpenChange={setOpen}
          site={site}
          panel={panel}
          advancePending={advance.isPending}
          onAdvance={() => advance.mutate()}
          onCancel={(reason) => cancel.mutate(reason)}
          cancelPending={cancel.isPending}
        />
      )}
    </>
  );
}

function OrderDetailDialog({
  order: o,
  open,
  onOpenChange,
  site,
  panel,
  advancePending,
  onAdvance,
  onCancel,
  cancelPending,
}: {
  order: OnlineOrderDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  site: CurrencyUnit;
  panel: CurrencyUnit;
  advancePending: boolean;
  onAdvance: () => void;
  onCancel: (reason?: string) => void;
  cancelPending: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const nextLabel = NEXT_LABEL[o.status];
  const cancelable = CANCELABLE.includes(o.status);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setConfirmCancel(false); setReason(""); } }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            سفارش #{toFa(o.number)}
            <Badge className={STATUS_CLASS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
          </DialogTitle>
          <DialogDescription>
            ثبت: {faDateTime(o.createdAt)} · روش پرداخت: {PAY_LABELS[o.payMethod] ?? o.payMethod}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Card>
            <CardContent className="p-4">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <Phone className="size-4 text-primary" aria-hidden /> {o.receiverName}
              </p>
              <p className="mb-1 text-sm text-muted-foreground" dir="ltr">{o.receiverPhone}</p>
              <p className="text-sm text-muted-foreground">{o.address}</p>
              {o.note && <p className="mt-2 text-xs text-muted-foreground">توضیح: {o.note}</p>}
              {o.status === "CANCELLED" && o.rejectReason && (
                <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                  دلیل لغو: {o.rejectReason}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="divide-y p-0">
              {o.lines.map((l) => (
                <div key={l.productId} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{l.productName}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {toFa(l.quantity)} × {fmt(l.unitPrice, site, panel)}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {fmt(l.lineTotal, site, panel)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-1.5 rounded-xl border p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>جمع کالاها</span><span className="tabular-nums">{fmt(o.subtotal, site, panel)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>ارسال</span>
              <span className="tabular-nums">{o.shippingFee > 0 ? fmt(o.shippingFee, site, panel) : "رایگان"}</span>
            </div>
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>قابل پرداخت</span>
              <span className="tabular-nums">{fmt(o.total, site, panel)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          {o.invoiceId && (
            <a
              href={`/admin/invoices/${o.invoiceId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              فاکتور داخلی <ArrowRight className="size-3.5" aria-hidden />
            </a>
          )}

          <div className="ms-auto flex items-center gap-2">
            {cancelable && !confirmCancel && (
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                <Ban className="size-4" aria-hidden /> رد / لغو
              </Button>
            )}

            {confirmCancel ? (
              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  className="w-56"
                  placeholder="دلیل لغو (جنس نبود / مشتری پشیمان…)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button variant="destructive" disabled={cancelPending} onClick={() => onCancel(reason.trim() || undefined)}>
                  {cancelPending ? "…" : "تأیید لغو"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>انصراف</Button>
              </div>
            ) : null}

            {nextLabel && (
              <Button onClick={onAdvance} disabled={advancePending}>
                <ChevronRight className="size-4" aria-hidden />
                {nextLabel}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}