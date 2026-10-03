"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getBackupStatus, runBackup } from "@/lib/api";
import { toFa } from "@/lib/format";

/**
 * یادآوری بک‌آپ پیش از بستن اپ دسکتاپ.
 *
 * قاب Tauri بستن پنجره را نگه می‌دارد و رویداد `app-close-requested` می‌فرستد.
 * تصمیم اینجا گرفته می‌شود، چون **فقط این صفحه توکن ورود دارد** و می‌تواند
 * وضعیت بک‌آپ را از سرور بپرسد.
 *
 * در مرورگر معمولی هیچ کاری نمی‌کند — `window.__TAURI__` وجود ندارد.
 */

type TauriGlobal = {
  event?: { listen: (e: string, cb: () => void) => Promise<() => void> };
  core?: { invoke: (cmd: string) => Promise<unknown> };
};

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

export function BackupCloseGuard() {
  const [open, setOpen] = React.useState(false);
  const [hours, setHours] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  const approveClose = React.useCallback(() => {
    void tauri()?.core?.invoke("approve_close");
  }, []);

  React.useEffect(() => {
    const t = tauri();
    if (!t?.event) return;

    let unlisten: (() => void) | undefined;

    void t.event
      .listen("app-close-requested", async () => {
        try {
          const status = await getBackupStatus();

          if (!status.shouldRemind) {
            approveClose();
            return;
          }

          setHours(status.hoursSinceLastBackup);
          setOpen(true);
        } catch {
          // اگر وضعیت را نشد گرفت (مثلاً کاربر فروشنده دسترسی ندارد یا سرور
          // قطع است)، نباید کاربر را در برنامه حبس کنیم.
          approveClose();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => unlisten?.();
  }, [approveClose]);

  const backupThenClose = async () => {
    setBusy(true);
    try {
      await runBackup("ON_CLOSE");
      toast.success("بک‌آپ گرفته شد");
      approveClose();
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "گرفتن بک‌آپ ناموفق بود");
      // عمداً بسته نمی‌شود: کاربر باید ببیند بک‌آپ نگرفته و خودش تصمیم بگیرد.
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={() => undefined}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-5 text-amber-600" />
            پیش از بستن، بک‌آپ بگیرید
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-7">
            {hours === null
              ? "تا حالا هیچ بک‌آپ موفقی گرفته نشده است."
              : `${toFa(Math.round(hours))} ساعت از آخرین بک‌آپ گذشته است.`}{" "}
            اگر الان بک‌آپ بگیرید، کار امروز از دست نمی‌رود.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Button className="h-11 w-full" disabled={busy} onClick={backupThenClose}>
            {busy ? "در حال گرفتن بک‌آپ…" : "بک‌آپ بگیر و ببند"}
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              نبند، برمی‌گردم
            </Button>
            <Button
              variant="ghost"
              className="flex-1 text-muted-foreground"
              disabled={busy}
              onClick={approveClose}
            >
              بدون بک‌آپ ببند
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
