"use client";

import * as React from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";

import { money, toFa } from "@/lib/format";

/** مدت‌های رایج. مقدار به دقیقه است تا «۱ ساعت» و «۳ روز» یک مکانیزم باشند. */
const PRESETS = [
  { minutes: 60, label: "۱ ساعت" },
  { minutes: 180, label: "۳ ساعت" },
  { minutes: 24 * 60, label: "۲۴ ساعت" },
  { minutes: 3 * 24 * 60, label: "۳ روز" },
  { minutes: 7 * 24 * 60, label: "۱ هفته" },
];

/**
 * تبدیل سبد فعلی به پیش‌فاکتور.
 *
 * عمداً از همان سبد صندوق فروش استفاده می‌شود و صفحه‌ی جداگانه‌ای ندارد —
 * دو نسخه از یک منطق سبد یعنی دو جا برای باگ.
 */
export function QuotationDialog({
  open,
  total,
  lineCount,
  customerName,
  onConfirm,
  onClose,
  pending,
}: {
  open: boolean;
  total: number;
  lineCount: number;
  customerName: string | null;
  /** `print` یعنی بلافاصله بعد از ثبت، برگه برای چاپ باز شود. */
  onConfirm: (validForMinutes: number, print: boolean) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [minutes, setMinutes] = React.useState(24 * 60);
  const [custom, setCustom] = React.useState("");
  /**
   * چاپ پس از ثبت.
   *
   * روشن می‌ماند، چون پیش‌فاکتور تقریباً همیشه برای این ساخته می‌شود که به دست
   * مشتری داده شود. اگر خاموش بود، فروشنده هر بار باید یک کلیک اضافه بزند.
   */
  const [print, setPrint] = React.useState(true);

  React.useEffect(() => {
    if (open) { setMinutes(24 * 60); setCustom(""); setPrint(true); }
  }, [open]);

  const effective = custom.trim() ? Math.max(1, Number(custom) || 0) : minutes;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">ثبت پیش‌فاکتور</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">اقلام</span>
              <span className="tabular-nums">{toFa(lineCount)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">مشتری</span>
              <span>{customerName ?? "بدون مشتری"}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
              <span>مبلغ کل</span>
              <span className="tabular-nums">{money(total)} ریال</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">این قیمت تا کِی معتبر است؟</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.minutes}
                  size="sm"
                  variant={!custom.trim() && minutes === p.minutes ? "default" : "outline"}
                  onClick={() => { setMinutes(p.minutes); setCustom(""); }}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">یا</span>
              <Input
                dir="ltr"
                className="h-9 w-28 text-right tabular-nums"
                placeholder="دقیقه"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              />
              <span className="text-sm text-muted-foreground">دقیقه</span>
            </div>
          </div>

          <p className="text-xs leading-6 text-muted-foreground">
            پیش‌فاکتور <b>هیچ موجودی‌ای کم نمی‌کند</b>. موجودی فقط در لحظه‌ی تبدیل به
            فاکتور بررسی و کم می‌شود.
          </p>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={print}
              onChange={(e) => setPrint(e.target.checked)}
              className="size-4 accent-primary"
            />
            <Printer className="size-4 text-muted-foreground" />
            بعد از ثبت، برگه را برای چاپ باز کن
          </label>

          <Button
            className="h-11 w-full"
            disabled={pending || lineCount === 0}
            onClick={() => onConfirm(effective, print)}
          >
            {pending ? "در حال ثبت…" : "ثبت پیش‌فاکتور"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
