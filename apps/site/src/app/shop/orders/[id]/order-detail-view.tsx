"use client";

// جزئیاتِ یک سفارش: اقلام، جمع‌ها، آدرس گیرنده و لغو (فقط تا پیش از تصمیمِ فروشنده).
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, MapPin, Phone, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { useShopSettings } from "../../_components/settings";
import { cancelShopOrder, getShopOrder } from "@/lib/shop-api";
import { useShopAuth } from "@/lib/shop-auth";
import {
  SHOP_PAY_LABELS,
  SHOP_STATUS_BADGE,
  SHOP_STATUS_LABELS,
  shopMoney,
} from "@/lib/shop-format";
import { faDateTime, toFa } from "@/lib/format";

export function OrderDetailView({ id }: { id: string }) {
  const { settings } = useShopSettings();
  const unit = settings?.unit ?? "TOMAN";
  const token = useShopAuth((s) => s.token);

  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const orderQuery = useQuery({
    queryKey: ["shop", "order", id],
    queryFn: () => getShopOrder(id),
    enabled: !!token,
  });

  const cancel = useMutation({
    mutationFn: () => cancelShopOrder(id),
    onSuccess: () => {
      toast.success("سفارش لغو شد");
      queryClient.invalidateQueries({ queryKey: ["shop", "order", id] });
      queryClient.invalidateQueries({ queryKey: ["shop", "my-orders"] });
      setConfirmCancel(false);
    },
    onError: () => toast.error("لغو سفارش ناموفق بود"),
  });

  const o = orderQuery.data;
  const status = (o?.status ?? "") as keyof typeof SHOP_STATUS_LABELS;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/shop/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden /> بازگشت به سفارش‌ها
      </Link>

      {orderQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : orderQuery.isError || !o ? (
        <p className="py-16 text-center text-muted-foreground">سفارش پیدا نشد.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold">سفارش #{toFa(o.number)}</h1>
            <Badge className={SHOP_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700"}>
              {SHOP_STATUS_LABELS[status] ?? o.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{faDateTime(o.createdAt)}</p>

          {o.status === "CANCELLED" && o.rejectReason && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              دلیل لغو: {o.rejectReason}
            </p>
          )}

          <Card>
            <CardContent className="divide-y p-0">
              {o.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {toFa(l.quantity)} × {shopMoney(l.unitPrice, unit)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {shopMoney(l.lineTotal, unit)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <SummaryRow label="جمع کالاها" value={shopMoney(o.subtotal, unit)} />
              {o.discount > 0 && (
                <SummaryRow label="تخفیف" value={`− ${shopMoney(o.discount, unit)}`} accent />
              )}
              <SummaryRow label="ارسال" value={o.shippingFee > 0 ? shopMoney(o.shippingFee, unit) : "رایگان"} />
              <Separator />
              <SummaryRow label="قابل پرداخت" value={shopMoney(o.total, unit)} bold />
              <p className="pt-1 text-xs text-muted-foreground">
                روش پرداخت: {SHOP_PAY_LABELS[o.payMethod] ?? o.payMethod}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <p className="font-bold">گیرنده</p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4 shrink-0" aria-hidden /> <span dir="ltr">{o.receiverPhone}</span> — {o.receiverName}
              </p>
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {o.address}
              </p>
              {o.note && <p className="text-muted-foreground">توضیح: {o.note}</p>}
            </CardContent>
          </Card>

          {o.status === "PLACED" &&
            (confirmCancel ? (
              <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <XCircle className="size-6 text-rose-600" aria-hidden />
                <p className="flex-1 text-sm text-rose-700">از لغو این سفارش مطمئن‌اید؟</p>
                <Button size="sm" variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                  {cancel.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "بله، لغو کن"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>
                  انصراف
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                لغو سفارش
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, accent, bold }: { label: string; value: string; accent?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-bold" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold" : "font-medium"} ${accent ? "text-emerald-600" : ""}`}>{value}</span>
    </div>
  );
}