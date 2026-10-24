"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MessageSquareText, Users } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkers } from "@/lib/api";
import { toFa } from "@/lib/format";

/**
 * انتخاب گیرنده‌(های) «ارسال به کارگر» + پیام دلخواه.
 *
 * کنار اسم هر کارگر تیک است — یک نفر یا چند نفر همزمان. همه روی **یک** Task
 * کار می‌کنند و هر قلم را اولی که تیک زد برمی‌دارد. «هر کارگری» یعنی استخر
 * عمومی بدون فیلتر گیرنده.
 */
export function WorkerPicker({
  open,
  itemCount,
  pending,
  onPick,
  onClose,
  title,
}: {
  open: boolean;
  itemCount: number;
  pending: boolean;
  /** خالی = هر کارگری؛ یک یا چند id = فقط همان‌ها. */
  onPick: (workerIds: string[], note: string) => void;
  onClose: () => void;
  /** عنوان اختیاری — مثلاً «ارسال برای چیدن». */
  title?: string;
}) {
  const workers = useQuery({ queryKey: ["workers"], queryFn: getWorkers, enabled: open });
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anyone, setAnyone] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setNote("");
      setSelected(new Set());
      setAnyone(false);
    }
  }

  const toggle = (id: string) => {
    setAnyone(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canConfirm = anyone || selected.size > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {title ?? `ارسال ${toFa(itemCount)} کالا به کارگر`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            یک یا چند کارگر را تیک بزنید تا با هم بچینند؛ هر قلم را هر کس گذاشت تیک
            می‌زند.
          </p>

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

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setAnyone(true);
              setSelected(new Set());
            }}
            className={`flex h-12 items-center justify-start gap-2 rounded-lg border px-3 text-sm
              ${anyone ? "border-primary bg-primary/5 font-medium" : "hover:border-primary/60"}`}
          >
            <span
              className={`flex size-5 items-center justify-center rounded border
                ${anyone ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
            >
              {anyone ? <Check className="size-3.5" /> : null}
            </span>
            <Users className="size-4" />
            هر کارگری که آزاد است
          </button>

          <div className="my-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            یا انتخاب مشخص
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

            {workers.data?.map((w) => {
              const checked = selected.has(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(w.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-right
                    ${checked ? "border-primary bg-primary/5" : "hover:border-primary/60"}
                    focus:outline-none focus:ring-2 focus:ring-primary`}
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded border
                      ${checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
                  >
                    {checked ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{w.fullName}</span>
                    <span className="block text-xs text-muted-foreground">{w.username}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            className="mt-2 h-11"
            disabled={pending || !canConfirm}
            onClick={() => onPick(anyone ? [] : [...selected], note)}
          >
            {pending
              ? "…"
              : anyone
                ? "ارسال برای هر کارگر آزاد"
                : selected.size
                  ? `ارسال برای ${toFa(selected.size)} کارگر`
                  : "ارسال"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
