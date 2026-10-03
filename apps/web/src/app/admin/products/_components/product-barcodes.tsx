"use client";

/**
 * بارکدهای یک کالا — و چسباندنِ بارکدِ خودِ جنس.
 *
 * تا امروز تنها راهِ اسکن‌شدنِ یک کالا، چاپ و چسباندنِ برچسبِ خودمان بود. ولی
 * بیشترِ قطعات از کارخانه بارکدِ خوانا دارند. با این کارت، جعبه را جلوی اسکنر
 * می‌گیری و کالا از همان لحظه با بارکدِ خودش کار می‌کند — بدون چاپ، بدون
 * چسباندن.
 *
 * در انباری با چند صد قفسه، این یک مرحله‌ی **فیزیکی** را حذف می‌کند.
 *
 * ورودی روی اسکنرِ USB حساب شده: اسکنر رشته را تایپ می‌کند و Enter می‌زند، پس
 * فرم با Enter ثبت می‌شود و فوکوس برمی‌گردد تا جعبه‌ی بعدی بدونِ دست‌زدن به موس
 * اسکن شود.
 */

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Barcode, Loader2, Trash2 } from "lucide-react";

import { linkBarcode, unlinkBarcode } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TYPE_LABEL: Record<string, string> = {
  INTERNAL: "داخلی",
  FACTORY: "کارخانه",
  QR: "QR",
  OTHER: "سایر",
};

export function ProductBarcodes({ product }: { product: Product }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const canEdit = useAuthStore((s) => s.hasRole)("ADMIN", "MANAGER", "STAFF");
  const canRemove = useAuthStore((s) => s.hasRole)("ADMIN", "MANAGER");

  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const rows = product.barcodes ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product", product.id] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const add = useMutation({
    mutationFn: () => linkBarcode({ productId: product.id, barcode: value.trim() }),
    onSuccess: (r) => {
      toast({
        title: r.alreadyLinked
          ? "این بارکد از قبل به همین کالا وصل بود"
          : "بارکد وصل شد",
      });
      setValue("");
      refresh();
      // جعبه‌ی بعدی بدون دست‌زدن به موس اسکن شود.
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "اتصال بارکد ناموفق بود",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
      });
      // متن می‌ماند تا کاربر ببیند چه اسکن شده و تصمیم بگیرد.
      inputRef.current?.select();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => unlinkBarcode(id),
    onSuccess: () => {
      toast({ title: "بارکد برداشته شد" });
      refresh();
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "برداشتن بارکد ناموفق بود",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
      }),
  });

  const canSubmit = value.trim().length >= 3 && !add.isPending;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Barcode className="size-4" /> بارکدها
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {canEdit && (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                // اسکنر USB خودش Enter می‌زند.
                if (e.key === "Enter" && canSubmit) add.mutate();
              }}
              placeholder="بارکد روی جعبه را اسکن کن یا بنویس"
              className="flex-1 font-mono"
              dir="ltr"
            />
            <Button disabled={!canSubmit} onClick={() => add.mutate()}>
              {add.isPending ? <Loader2 className="size-4 animate-spin" /> : "وصل کن"}
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            بارکدی ثبت نشده. با اسکن بارکد روی جعبه، کالا بدون چاپ برچسب پیدا
            می‌شود.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((b) => {
              const isInternal =
                b.type === "INTERNAL" || b.barcode === product.internalBarcode;

              return (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <code className="flex-1 font-mono text-sm" dir="ltr">
                    {b.barcode}
                  </code>

                  <Badge variant={isInternal ? "secondary" : "outline"}>
                    {TYPE_LABEL[b.type] ?? b.type}
                  </Badge>

                  {/* بارکد داخلی روی برچسبِ چاپ‌شده است — سرور هم ردش می‌کند. */}
                  {canRemove && !isInternal && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(b.id)}
                      aria-label="برداشتن بارکد"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
