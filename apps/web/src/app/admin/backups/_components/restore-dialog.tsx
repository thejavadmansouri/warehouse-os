"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import type { BackupFile } from "@/lib/types";
import { money } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** همان عبارتی که سرور هم بررسی می‌کند. */
export const CONFIRM_PHRASE = "بازیابی";

/**
 * تأییدِ بازیابی.
 *
 * عمداً تایپیِ یک عبارت است نه یک دکمه: این تنها کاری در کل پنل است که **همه‌ی**
 * داده‌ی فعلی را جایگزین می‌کند. کلیکِ اشتباه روی دکمه اتفاق می‌افتد؛ تایپِ
 * اشتباهِ یک کلمه‌ی مشخص نه.
 */
export function RestoreDialog({
  file,
  onOpenChange,
  onConfirm,
  loading,
}: {
  file: BackupFile | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (phrase: string) => void;
  loading: boolean;
}) {
  const [phrase, setPhrase] = React.useState("");

  React.useEffect(() => {
    if (!file) setPhrase("");
  }, [file]);

  const ok = phrase.trim() === CONFIRM_PHRASE;

  return (
    <AlertDialog open={!!file} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            بازیابی از پشتیبان
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                همه‌ی داده‌ی فعلی — کالاها، فاکتورها، موجودی و کاربران — با محتوای
                این فایل <b className="text-destructive">جایگزین</b> می‌شود.
              </p>

              {file ? (
                <div className="rounded-md border p-3 text-foreground">
                  <div className="font-medium">{file.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatJalali(new Date(file.modifiedAt))}
                    {" — "}
                    {money(Math.round(file.sizeBytes / 1048576))} مگابایت
                  </div>
                </div>
              ) : null}

              <p className="rounded-md bg-muted p-3 text-foreground">
                پیش از شروع، یک پشتیبان از وضعیت فعلی گرفته می‌شود؛ اگر فایل
                اشتباهی را انتخاب کرده باشید، راه برگشت هست.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-phrase">
            برای تأیید، عبارت «{CONFIRM_PHRASE}» را بنویسید
          </Label>
          <Input
            id="confirm-phrase"
            autoFocus
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>انصراف</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm(phrase.trim());
            }}
            disabled={!ok || loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "در حال بازیابی…" : "بازیابی کن"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


/** نتیجه‌ی بازیابی — مخصوصاً هشدارِ اختلافِ نسخه که نباید گم شود. */
export function RestoreResultCard({
  result,
  onDismiss,
}: {
  result: {
    sourceFile: string;
    preRestoreFile: string | null;
    counts: { products: number; users: number };
    pendingMigrations: string[];
    message: string;
  };
  onDismiss: () => void;
}) {
  const stale = result.pendingMigrations.length > 0;

  return (
    <div
      role="status"
      className={`rounded-lg border p-4 ${
        stale ? "border-amber-500/50 bg-amber-500/10" : "border-emerald-500/50 bg-emerald-500/10"
      }`}
    >
      <p className="font-medium">{result.message}</p>

      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>از فایل: {result.sourceFile}</li>
        <li>
          کالاها: {money(result.counts.products)} — کاربران: {money(result.counts.users)}
        </li>
        {result.preRestoreFile ? (
          <li>پشتیبانِ پیش از بازیابی: {result.preRestoreFile}</li>
        ) : null}
      </ul>

      {stale ? (
        <div className="mt-3 rounded-md bg-background/60 p-3 text-sm">
          <p className="font-medium">
            این پشتیبان از نسخه‌ی قدیمی‌تری از برنامه است.
          </p>
          <p className="mt-1 text-muted-foreground">
            {result.pendingMigrations.length} به‌روزرسانیِ دیتابیس اجرا نشده. تا
            اجرا نشود، بخش‌هایی از برنامه خطا می‌دهند. با پشتیبانی تماس بگیرید یا
            به‌روزرسانیِ دیتابیس را اجرا کنید.
          </p>
        </div>
      ) : null}

      <Button variant="outline" size="sm" className="mt-3" onClick={onDismiss}>
        بستن
      </Button>
    </div>
  );
}
