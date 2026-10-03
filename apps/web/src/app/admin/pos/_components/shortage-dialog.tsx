"use client";

/**
 * کسری محصول — چیزی که مشتری خواست و نداشتیم.
 *
 * **هیچ عددی از انبار را دست نمی‌زند.** این عمدی است: ثبتِ کسری یک سیگنالِ
 * خرید است، نه اصلاحِ موجودی. اگر فروشنده از همین‌جا می‌توانست عدد قفسه را
 * عوض کند، آن لحظه راحت بود و شش ماه بعد هیچ‌کس نمی‌دانست موجودی‌ها از کجا
 * آمده‌اند. اصلاحِ موجودی کارِ «تعدیل» است که رد باقی می‌گذارد.
 *
 * چرا کالای بیرونِ کاتالوگ هم پذیرفته می‌شود: نیمی از تقاضاهایی که جواب
 * نمی‌گیرند برای چیزی است که اصلاً ثبت نشده — و همان‌ها ارزشمندترین‌اند، چون
 * هیچ گزارشِ دیگری نمی‌تواند نشانشان دهد.
 *
 * فرم و فهرست در یک دیالوگ‌اند تا فروشنده هنگام ثبت ببیند این کالا قبلاً هم
 * خواسته شده — همان چیزی که به مشتری می‌گوید «چند نفر دیگر هم پرسیده‌اند،
 * سفارش می‌دهیم».
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageX, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";

import { createShortage, getShortages, resolveShortage } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { toFa } from "@/lib/format";
import { useAuthStore } from "@/lib/auth-store";
import { ProductSearchSelect } from "@/components/product-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ShortageDialog({
  open,
  onOpenChange,
  warehouseId,
  customerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouseId: string;
  /** مشتریِ فعلیِ صندوق، اگر انتخاب شده — تا بشود بعداً خبرش کرد. */
  customerId?: string | null;
}) {
  const qc = useQueryClient();
  const canResolve = useAuthStore((s) => s.hasRole)("ADMIN", "MANAGER");

  const [product, setProduct] = React.useState<Product | null>(null);
  const [name, setName] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [note, setNote] = React.useState("");

  const listQ = useQuery({
    queryKey: ["shortages", "OPEN"],
    queryFn: () => getShortages({ status: "OPEN" }),
    enabled: open,
  });

  const reset = () => {
    setProduct(null);
    setName("");
    setQuantity(1);
    setNote("");
  };

  const save = useMutation({
    mutationFn: () =>
      createShortage({
        productId: product?.id,
        // نامِ کالای کاتالوگ خودکار پر می‌شود تا اگر روزی کالا حذف شد، رکورد
        // هنوز بگوید درباره‌ی چه بوده.
        productName: (product?.name ?? name).trim(),
        quantity,
        customerId: customerId ?? undefined,
        warehouseId,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("کسری ثبت شد");
      reset();
      qc.invalidateQueries({ queryKey: ["shortages"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "ثبت کسری ناموفق بود"),
  });

  const resolveMut = useMutation({
    mutationFn: (v: { id: string; status: "ORDERED" | "DISMISSED" }) =>
      resolveShortage(v.id, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shortages"] }),
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "تغییر وضعیت ناموفق بود"),
  });

  const finalName = (product?.name ?? name).trim();
  const canSubmit = finalName.length >= 2 && quantity >= 1 && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="size-5" /> کسری محصول
          </DialogTitle>
          <DialogDescription>
            چیزی که مشتری خواست و نداشتیم. موجودی را تغییر نمی‌دهد — فقط برای
            تصمیم خرید ثبت می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border p-3">
          <ProductSearchSelect
            value={product?.id}
            onChange={(p) => {
              setProduct(p);
              if (p) setName("");
            }}
            placeholder="جست‌وجوی کالا در کاتالوگ…"
          />

          {/* کالای بیرونِ کاتالوگ: وقتی چیزی انتخاب نشده، نام دستی پذیرفته
              می‌شود. همین حالت است که بیشترین ارزش را دارد. */}
          {!product && (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="یا نام کالا را بنویس (اگر در کاتالوگ نیست)"
            />
          )}

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)}
              className="w-24"
              aria-label="تعداد"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="توضیح (اختیاری)"
              className="flex-1"
            />
            <Button disabled={!canSubmit} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "ثبت"}
            </Button>
          </div>
        </div>

        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          {listQ.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin" /> در حال بارگذاری…
            </div>
          ) : !listQ.data?.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              کسری بازی ثبت نشده.
            </div>
          ) : (
            listQ.data.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.productName}</span>
                    {!s.productId && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        خارج از کاتالوگ
                      </Badge>
                    )}
                    {s.timesRequested > 1 && (
                      <Badge variant="destructive" className="shrink-0 tabular-nums">
                        {toFa(s.timesRequested)} بار
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {toFa(s.quantity)} عدد
                    {s.customer
                      ? ` — ${s.customer.firstName} ${s.customer.lastName ?? ""}`
                      : ""}
                    {s.note ? ` — ${s.note}` : ""}
                  </div>
                </div>

                {canResolve && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolveMut.isPending}
                      onClick={() =>
                        resolveMut.mutate({ id: s.id, status: "ORDERED" })
                      }
                      title="سفارش داده شد"
                    >
                      <ShoppingCart className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resolveMut.isPending}
                      onClick={() =>
                        resolveMut.mutate({ id: s.id, status: "DISMISSED" })
                      }
                      title="تهیه نمی‌کنیم"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
