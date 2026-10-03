"use client";

/**
 * نوار چهار قیمتِ کالا — روی کاردکس (گردش کالا) هم نمایش داده می‌شود تا مدیر
 * بدون رفتن به جای دیگر، قیمت‌ها را همان‌جا ببیند و ویرایش کند.
 *
 * چهار قیمت همیشه در یک ردیف و هم‌ترازند، هر کدام با رنگِ خودش:
 *   خرید (آبی) · فروش (سبز) · ۱۵٪ (کهربایی) · مدیر (بنفش)
 *
 * فقط قیمتِ «فروش» و «مدیر» قابل ویرایش‌اند (مدیر/مدیر ارشد). بهای خرید و
 * پیشنهادیِ ۱۵٪ از روی خرید حساب می‌شوند و اینجا فقط دیده می‌شوند.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

import { getProduct, setProductPrice } from "@/lib/api";
import { rial } from "@/lib/format";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { EditablePrice } from "@/app/admin/pos/_components/inline-results";
import { LoadingState } from "@/components/states";

export function ProductPriceStrip({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";

  const q = useQuery({
    queryKey: ["product", productId],
    queryFn: () => getProduct(productId),
    enabled: !!productId,
  });

  const save = useMutation({
    mutationFn: (v: { field: "sale" | "manager"; value: number }) =>
      setProductPrice(
        productId,
        v.field === "sale" ? { salePrice: v.value } : { managerPrice: v.value },
      ),
    onSuccess: (_price, v) => {
      qc.invalidateQueries({ queryKey: ["product", productId] });
      qc.invalidateQueries({ queryKey: ["product", productId, "prices"] });
      toast.success(v.field === "sale" ? "قیمت فروش به‌روز شد" : "قیمت مدیر به‌روز شد");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "ثبت قیمت ناموفق بود"),
  });

  const latest = q.data?.prices?.[0];
  const purchasePrice = latest?.purchasePrice ?? null;
  const suggestedPrice =
    purchasePrice != null ? Math.round(purchasePrice * 1.15) : null;

  if (q.isLoading) return <LoadingState />;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Banknote className="size-3.5" />
        قیمت‌ها
        {canManage && (
          <span className="font-normal opacity-70">
            — برای ویرایش روی «فروش» یا «مدیر» کلیک کنید
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {purchasePrice != null && (
          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs tabular-nums text-sky-700 dark:text-sky-300" title="بهای خرید">
            <span className="opacity-70">خرید</span>
            {rial(purchasePrice)}
          </span>
        )}
        <EditablePrice
          productId={productId}
          field="sale"
          label="فروش"
          value={latest?.salePrice ?? null}
          canManage={canManage}
          onSave={(_, field, value) => save.mutate({ field, value })}
        />
        {suggestedPrice != null && (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs tabular-nums text-amber-700 dark:text-amber-300" title="قیمت پیشنهادی — خرید + ۱۵٪ سود">
            <span className="opacity-70">۱۵٪</span>
            {rial(suggestedPrice)}
          </span>
        )}
        {canManage && (
          <EditablePrice
            productId={productId}
            field="manager"
            label="مدیر"
            value={latest?.managerPrice ?? null}
            canManage={canManage}
            onSave={(_, field, value) => save.mutate({ field, value })}
          />
        )}
      </div>
    </div>
  );
}
