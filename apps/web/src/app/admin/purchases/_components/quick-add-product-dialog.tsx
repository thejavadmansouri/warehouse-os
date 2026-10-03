"use client";

/**
 * دیالوگ افزودن سریع محصول — برای کالایی که روی برگه‌ی فروشنده هست ولی در
 * کاتالوگ نیست.
 *
 * فلسفه: سرعتِ POS. فقط همان چند فیلدی که برای ثبتِ فاکتور خرید لازم است؛
 * کد کالا خودکار ساخته می‌شود (سرویس محصول همین کار را می‌کند وقتی sku خالی
 * بماند) و بقیه‌ی مشخصات (برند، مدل خودرو، حداقل موجودی و…) بعداً از صفحه‌ی
 * خود کالا تکمیل می‌شود.
 *
 * خروجی: محصول تازه — که فرم خرید بلافاصله به ردیفِ جاری می‌بندد و قیمتِ
 * خریدی که کاربر همین‌جا زده را روی همان ردیف می‌گذارد.
 */

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createProduct } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { unitLabel } from "@/lib/currency";

export function QuickAddProductDialog({
  open,
  onOpenChange,
  /** بارکد اسکن‌شده یا تایپ‌شده — اگر باشد، خودش روی کالا ثبت می‌شود. */
  barcode,
  /** قیمت خریدی که کاربر روی ردیف زده — پیش‌فرضِ فیلد قیمت. */
  defaultPurchasePrice,
  /** نامی که کاربر در جست‌وجو زده بود — پیش‌فرضِ فیلد نام. */
  suggestedName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  barcode?: string;
  defaultPurchasePrice?: number;
  suggestedName?: string;
  onCreated: (product: Product) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("عدد");
  const [barcodeValue, setBarcodeValue] = React.useState("");
  const [purchasePrice, setPurchasePrice] = React.useState(0);
  const [salePrice, setSalePrice] = React.useState(0);

  // هر بار باز شدن، فیلدها از زمینه‌ی فرم خرید پر می‌شوند — نه از رندر قبلی.
  React.useEffect(() => {
    if (!open) return;
    setName(suggestedName ?? "");
    setUnit("عدد");
    setBarcodeValue(barcode ?? "");
    setPurchasePrice(defaultPurchasePrice ?? 0);
    setSalePrice(0);
  }, [open, suggestedName, barcode, defaultPurchasePrice]);

  const createM = useMutation({
    mutationFn: () => {
      const dto: Record<string, unknown> = {
        name: name.trim(),
        unit: unit.trim() || undefined,
        isActive: true,
      };
      if (barcodeValue.trim()) dto.internalBarcode = barcodeValue.trim();
      if (purchasePrice > 0) dto.purchasePrice = purchasePrice;
      if (salePrice > 0) dto.salePrice = salePrice;
      return createProduct(dto as never);
    },
    onSuccess: (p) => {
      toast.success(`کالای «${p.name}» اضافه شد`);
      // کاتالوگ‌ها تازه شوند تا جست‌وجوی بعدی همان کالا را پیدا کند.
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["purchase-product"] });
      onCreated(p);
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e instanceof ApiException ? e.message : "افزودن کالا ناموفق بود");
    },
  });

  const valid = name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!createM.isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن کالای جدید</DialogTitle>
          <DialogDescription>
            این کالا در کاتالوگ نیست — سریع اضافه‌اش کن. کد کالا خودکار ساخته می‌شود و بقیه‌ی مشخصات بعداً از صفحه‌ی کالا قابل تکمیل است.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="qa-name">نام کالا *</Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: لنت جلو پراید"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="qa-unit">واحد</Label>
              <Input id="qa-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="عدد / جعبه / متر" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qa-barcode">بارکد</Label>
              <Input
                id="qa-barcode"
                dir="ltr"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="اختیاری"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="qa-purchase">قیمت خرید ({unitLabel()})</Label>
              <MoneyInput id="qa-purchase" value={purchasePrice} onChange={setPurchasePrice} placeholder="۰" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qa-sale">قیمت فروش ({unitLabel()})</Label>
              <MoneyInput id="qa-sale" value={salePrice} onChange={setSalePrice} placeholder="۰" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createM.isPending}>
            انصراف
          </Button>
          <Button type="button" onClick={() => createM.mutate()} disabled={!valid || createM.isPending}>
            {createM.isPending ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
            افزودن و انتخاب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
