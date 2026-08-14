"use client";

import * as React from "react";

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
import { Input } from "@/components/ui/input";

/**
 * تأییدِ کارهای برگشت‌ناپذیر — با الگوی استانداردِ AlertDialog.
 *
 * `requireReason` برای کارهایی مثل ابطال است که دلیلشان باید ثبت شود؛ دکمه‌ی
 * تأیید تا دلیل وارد نشود غیرفعال می‌ماند و دلیل به `onConfirm` پاس داده می‌شود.
 * دیالوگ با کلیکِ تأیید خودش بسته نمی‌شود (preventDefault) تا والد بعد از
 * موفقیتِ واقعی ببنددش.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "آیا مطمئن هستید؟",
  description,
  confirmText = "تایید",
  cancelText = "انصراف",
  destructive = false,
  loading = false,
  requireReason = false,
  reasonPlaceholder,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  /** ورودیِ دلیل را الزامی می‌کند و مقدارش را به onConfirm می‌فرستد. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const canConfirm = !loading && (!requireReason || reason.trim().length > 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">{description}</div>
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {requireReason ? (
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={reasonPlaceholder}
            className="h-10"
          />
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm(requireReason ? reason.trim() : undefined);
            }}
            disabled={!canConfirm}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {loading ? "در حال انجام..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
