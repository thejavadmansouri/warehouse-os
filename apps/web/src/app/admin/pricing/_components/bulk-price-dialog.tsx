"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bulkSetPrice } from "@/lib/api";
import { money, parseNum, toFa } from "@/lib/format";
import type { BulkPriceOp, BulkPriceSelect } from "@/lib/types";

type Mode = "set" | "percent" | "markup";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "set", label: "قیمت ثابت", hint: "همین مبلغ روی همه‌ی کالاهای انتخاب‌شده" },
  { id: "percent", label: "درصد کم/زیاد", hint: "قیمت فعلی را درصدی بالا یا پایین ببر" },
  { id: "markup", label: "سود از قیمت خرید", hint: "قیمت فروش = قیمت خرید + درصد سود" },
];

/**
 * قیمت‌گذاری دسته‌ای.
 *
 * قبل از هر نوشتنی یک dry-run می‌رود و می‌گوید چند کالا اثر می‌گیرند. با ۳۳ هزار
 * کالا، یک فیلترِ اشتباه می‌تواند کل کاتالوگ را قیمت‌گذاری کند و چون تاریخچه
 * append-only است، برگرداندنش دستی و دردناک می‌شود.
 */
export function BulkPriceDialog({
  open,
  select,
  scopeLabel,
  onDone,
  onClose,
}: {
  open: boolean;
  select: BulkPriceSelect;
  /** توضیح خواندنیِ اینکه این عملیات روی چه چیزی اجرا می‌شود. */
  scopeLabel: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("set");
  const [salePrice, setSalePrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [percent, setPercent] = useState(0);
  const [field, setField] = useState<"salePrice" | "purchasePrice">("salePrice");
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("set");
    setSalePrice(0);
    setPurchasePrice(0);
    setPercent(0);
    setField("salePrice");
    setPreview(null);
  }, [open]);

  const buildOp = (): BulkPriceOp => {
    if (mode === "set") {
      return {
        kind: "set",
        ...(salePrice > 0 ? { salePrice } : {}),
        ...(purchasePrice > 0 ? { purchasePrice } : {}),
      };
    }
    if (mode === "percent") return { kind: "percent", field, percent };
    return { kind: "markup", percent };
  };

  const valid =
    mode === "set"
      ? salePrice > 0 || purchasePrice > 0
      : percent !== 0;

  // شمارش، بدون نوشتن.
  const count = useMutation({
    mutationFn: () => bulkSetPrice({ select, op: buildOp(), dryRun: true }),
    onSuccess: (r) => setPreview(r.matched),
    onError: () => toast.error("شمارش ناموفق بود"),
  });

  const apply = useMutation({
    mutationFn: () => bulkSetPrice({ select, op: buildOp() }),
    onSuccess: (r) => {
      toast.success(
        `${toFa(r.updated)} کالا قیمت گرفت` +
          (r.skipped ? ` — ${toFa(r.skipped)} مورد رد شد` : "")
      );
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "قیمت‌گذاری ناموفق بود"),
  });

  // هر تغییری در عملیات، شمارشِ قبلی را بی‌اعتبار می‌کند.
  useEffect(() => setPreview(null), [mode, salePrice, purchasePrice, percent, field]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">قیمت‌گذاری گروهی</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            دامنه: <span className="font-semibold">{scopeLabel}</span>
          </p>

          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`rounded-lg border p-2 text-xs transition-colors ${
                  mode === m.id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "hover:border-primary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {MODES.find((m) => m.id === mode)?.hint}
          </p>

          {mode === "set" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                قیمت فروش
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="h-10 text-right tabular-nums"
                  value={salePrice ? money(salePrice) : ""}
                  onChange={(e) => setSalePrice(parseNum(e.target.value))}
                  placeholder="بدون تغییر"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                قیمت خرید
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="h-10 text-right tabular-nums"
                  value={purchasePrice ? money(purchasePrice) : ""}
                  onChange={(e) => setPurchasePrice(parseNum(e.target.value))}
                  placeholder="بدون تغییر"
                />
              </label>
            </div>
          )}

          {mode !== "set" && (
            <div className="flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                درصد
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="h-10 text-right tabular-nums"
                  value={percent ? toFa(percent) : ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim().startsWith("-") ? -1 : 1;
                    setPercent(raw * parseNum(e.target.value));
                  }}
                  placeholder="۱۵"
                />
              </label>
              {mode === "percent" && (
                <div className="flex gap-1 pb-0.5">
                  {(["salePrice", "purchasePrice"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setField(f)}
                      className={`h-10 rounded-md border px-3 text-xs ${
                        field === f
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {f === "salePrice" ? "فروش" : "خرید"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "markup" && (
            <p className="text-xs text-muted-foreground">
              کالاهایی که قیمت خرید ندارند رد می‌شوند — قیمت صفر روی فاکتور یعنی جنس مجانی.
            </p>
          )}

          {preview !== null && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                این عملیات روی <span className="font-bold">{toFa(preview)}</span> کالا اجرا
                می‌شود. تاریخچه‌ی قیمت نگه داشته می‌شود، ولی برگرداندنش دستی است.
              </span>
            </div>
          )}

          <div className="flex gap-2">
            {preview === null ? (
              <Button
                className="flex-1"
                variant="outline"
                disabled={!valid || count.isPending}
                onClick={() => count.mutate()}
              >
                {count.isPending ? (
                  <><Loader2 className="size-4 animate-spin" /> در حال شمارش…</>
                ) : (
                  "چند کالا اثر می‌گیرد؟"
                )}
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={apply.isPending || preview === 0}
                onClick={() => apply.mutate()}
              >
                {apply.isPending ? "در حال ثبت…" : `اعمال روی ${toFa(preview)} کالا`}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>
              انصراف
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
