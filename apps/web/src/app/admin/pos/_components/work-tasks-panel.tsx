"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, ClipboardList, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cancelWorkTask, getWorkTasks } from "@/lib/api";
import { toFa } from "@/lib/format";
import type { WorkTask } from "@/lib/types";
import { TaskProgressBar } from "./task-progress";

const STATUS_LABELS: Record<WorkTask["status"], string> = {
  PENDING: "در انتظار",
  IN_PROGRESS: "در جریان",
  COMPLETED: "تکمیل شده",
  CANCELLED: "لغو شده",
};

/** عنوانِ خوانای کار — فاکتور/پیش‌فاکتور یا «کار ساده». */
function taskTitle(t: WorkTask): string {
  if (t.invoice) return `فاکتور ${toFa(t.invoice.number)}`;
  if (t.quotation) return `پیش‌فاکتور ${toFa(t.quotation.number)}`;
  return "کار ساده";
}

/**
 * پنل «کارهای انبار» — همه‌ی کارهای ارسال‌شده با پیشرفت زنده.
 *
 * رویدادِ work-task.progress (از طریق use-live-events) همین کوئری را invalidate
 * می‌کند، پس نوار سبزِ یک کارگرِ در حال تیک‌زدن تقریباً همان لحظه جلو می‌رود.
 * مدیر بدون باز کردن جزئیات می‌فهمد هر کار چقدر مانده.
 */
export function WorkTasksPanel({
  open,
  warehouseId,
  onClose,
}: {
  open: boolean;
  warehouseId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<WorkTask | null>(null);

  const tasks = useQuery({
    queryKey: ["work-tasks", warehouseId],
    queryFn: () => getWorkTasks({ warehouseId }),
    enabled: open && !!warehouseId,
    // fallbackِ offline: اگر کانال زنده وصل نبود، پنل باز خودش تازه می‌شود.
    refetchInterval: 15_000,
  });

  const doCancel = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => cancelWorkTask(v.id, v.reason),
    onSuccess: (task) => {
      toast.success(`کار ${taskTitle(task)} لغو شد`);
      setCancelling(null);
      qc.invalidateQueries({ queryKey: ["work-tasks"] });
    },
    onError: () => toast.error("لغو کار ناموفق بود"),
  });

  const rows = tasks.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4" />
              کارهای انبار
              {rows.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {toFa(rows.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED").length)}{" "}
                  فعال
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {tasks.isLoading && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
            </p>
          )}

          {!tasks.isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              هنوز کاری برای کارگر فرستاده نشده
            </p>
          )}

          {rows.length > 0 && (
            <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto">
              {rows.map((t) => {
                const terminal = t.status === "COMPLETED" || t.status === "CANCELLED";
                return (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-3 ${terminal ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{taskTitle(t)}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {STATUS_LABELS[t.status]}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {t.assignedTo
                              ? `کارگر: ${t.assignedTo.fullName}`
                              : "هر کارگری که آزاد است"}
                            {t.requestedBy && ` · درخواست: ${t.requestedBy.fullName}`}
                          </div>
                          {t.note && (
                            <div className="mt-0.5 truncate text-xs text-sky-700 dark:text-sky-400">
                              {t.note}
                            </div>
                          )}
                        </div>
                      </div>

                      {!terminal && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          title="لغو کار"
                          onClick={() => setCancelling(t)}
                        >
                          <Ban className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>

                    <div className="mt-2">
                      <TaskProgressBar task={t} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => { if (!v) setCancelling(null); }}
        title={cancelling ? `لغو ${taskTitle(cancelling)}؟` : "لغو کار؟"}
        description="کارگر دیگر تیک‌های این کار را نمی‌زند و کار از صف او حذف می‌شود."
        destructive
        confirmText="بله، لغو کن"
        loading={doCancel.isPending}
        onConfirm={(reason) =>
          cancelling && doCancel.mutate({ id: cancelling.id, reason: reason ?? undefined })
        }
      />
    </>
  );
}
