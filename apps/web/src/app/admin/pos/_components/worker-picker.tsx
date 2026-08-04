"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Users } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkers } from "@/lib/api";

/**
 * انتخاب کارگرِ گیرنده‌ی «ارسال به کارگر» + پیام دلخواه.
 *
 * «هر کارگری» یعنی کار برای همه‌ی کارگرهای انبار دیده می‌شود و هر کدام آزاد
 * بود برمی‌دارد. انتخاب یک نفر خاص یعنی فقط او آن را می‌بیند. پیام اختیاری
 * روی گوشی کارگر همان‌جا در نوتیفیکیشن (و زیر هر قلم) نمایش داده می‌شود.
 */
export function WorkerPicker({
  open,
  itemCount,
  pending,
  onPick,
  onClose,
}: {
  open: boolean;
  itemCount: number;
  pending: boolean;
  onPick: (workerId: string | null, note: string) => void;
  onClose: () => void;
}) {
  const workers = useQuery({ queryKey: ["workers"], queryFn: getWorkers, enabled: open });
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            ارسال {itemCount} کالا به کارگر
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquareText className="size-4" />
            پیام برای کارگر (اختیاری)
          </label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="مثلاً: پشت پیشخوان بگذارید"
            className="h-10"
          />
          <Button
            variant="outline"
            className="h-12 justify-start"
            disabled={pending}
            onClick={() => onPick(null, note)}
          >
            <Users className="ms-2 size-4" />
            هر کارگری که آزاد است
          </Button>

          <div className="my-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            یا یک کارگر مشخص
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {workers.isLoading && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                در حال دریافت…
              </p>
            )}

            {!workers.isLoading && (workers.data?.length ?? 0) === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                کارگری ثبت نشده است
              </p>
            )}

            {workers.data?.map((w) => (
              <button
                key={w.id}
                disabled={pending}
                onClick={() => onPick(w.id, note)}
                className="rounded-lg border p-3 text-right hover:border-primary
                           hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span className="block font-medium">{w.fullName}</span>
                <span className="block text-xs text-muted-foreground">{w.username}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
