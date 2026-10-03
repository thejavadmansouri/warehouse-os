"use client";

/**
 * هشدارِ قیمتِ مشکوک پیش از ثبتِ فاکتور خرید.
 *
 * چرا دیالوگ و نه یک متنِ کنارِ ردیف: قیمتِ خرید بی‌صدا قیمتِ تمام‌شده‌ی کالا
 * می‌شود و از آن به بعد گزارشِ سود را خراب می‌کند. متنی که کنارِ فرم بنشیند
 * دیده نمی‌شود؛ این باید جلوی کار را بگیرد و یک تصمیمِ آگاهانه بخواهد.
 *
 * ولی **مسدود نمی‌کند**. قیمت‌ها واقعاً می‌پرند و اگر راهِ ثبت بسته باشد کاربر
 * راهِ دور پیدا می‌کند — مثلاً قیمت را الکی درست وارد می‌کند تا رد شود، که از
 * خودِ اشتباه بدتر است چون دیگر ردی هم نمی‌ماند.
 */

import * as React from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import type { PurchasePriceWarning } from "@/lib/types";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** برچسبِ کوتاهِ هر نوع — تا کاربر بدون خواندنِ جمله بفهمد با چه مقایسه شده. */
const COMPARED_TO: Record<PurchasePriceWarning["kind"], string> = {
  TENFOLD_JUMP: "خرید قبلی",
  BIG_JUMP: "خرید قبلی",
  BIG_DROP: "خرید قبلی",
  ABOVE_SALE_PRICE: "قیمت فروش",
};

export function PriceWarningDialog({
  warnings,
  onCancel,
  onConfirm,
  pending,
}: {
  /** null یعنی بسته. */
  warnings: PurchasePriceWarning[] | null;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const open = warnings !== null && warnings.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-5" />
            قیمت غیرعادی
          </DialogTitle>
          <DialogDescription>
            این قیمت‌ها با سابقه‌ی کالا نمی‌خوانند. اگر درست‌اند ثبت کن؛ اگر
            نه، برگرد و اصلاحشان کن.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto py-1">
          {(warnings ?? []).map((w) => (
            <div
              key={`${w.productId}-${w.lineIndex}`}
              className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
            >
              <div className="font-medium">
                ردیف {w.lineIndex + 1} — {w.productName}
              </div>

              <div className="mt-1 text-amber-700 dark:text-amber-400">
                {w.message}
              </div>

              <div
                className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground"
                dir="ltr"
              >
                <span>{money(w.current)}</span>
                <ArrowLeft className="size-3" />
                <span>{money(w.previous)}</span>
                <span className="font-sans">({COMPARED_TO[w.kind]})</span>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          {/* «اصلاح» اول می‌آید و دکمه‌ی اصلی است: در تردید، برگشتن درست‌تر است. */}
          <Button onClick={onCancel} disabled={pending}>
            برمی‌گردم و اصلاح می‌کنم
          </Button>
          <Button variant="outline" onClick={onConfirm} disabled={pending}>
            قیمت‌ها درست است، ثبت کن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
