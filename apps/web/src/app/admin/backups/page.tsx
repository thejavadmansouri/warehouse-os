"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseBackup, ShieldCheck, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getBackupHistory,
  getBackupStatus,
  runBackup,
  updateBackupConfig,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, toFa } from "@/lib/format";

function mb(bytes: number | null): string {
  if (bytes == null) return "—";
  return `${toFa((bytes / 1048576).toFixed(1))} مگابایت`;
}

const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: "دستی",
  SCHEDULED: "زمان‌بندی‌شده",
  ON_CLOSE: "پیش از بستن",
};

export default function BackupsPage() {
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: ["backup-status"],
    queryFn: getBackupStatus,
    // در حین اجرا زودتر تازه شود تا کاربر بداند تمام شده.
    refetchInterval: (q) => (q.state.data?.isRunning ? 2000 : 30000),
  });

  const history = useQuery({
    queryKey: ["backup-history"],
    queryFn: () => getBackupHistory(20),
  });

  const [draft, setDraft] = React.useState<{
    destination: string;
    hour: number;
    minute: number;
    keepCount: number;
    remindAfterHours: number;
    enabled: boolean;
  } | null>(null);

  // تنظیمات سرور تا وقتی کاربر چیزی عوض نکرده، مرجع است.
  React.useEffect(() => {
    if (status.data && !draft) {
      const c = status.data.config;
      setDraft({
        destination: c.destination,
        hour: c.hour,
        minute: c.minute,
        keepCount: c.keepCount,
        remindAfterHours: c.remindAfterHours,
        enabled: c.enabled,
      });
    }
  }, [status.data, draft]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["backup-status"] });
    qc.invalidateQueries({ queryKey: ["backup-history"] });
  };

  const save = useMutation({
    mutationFn: () => updateBackupConfig(draft!),
    onSuccess: () => { toast.success("تنظیمات ذخیره شد"); refresh(); },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      toast.error(err?.message ?? "ذخیره‌ی تنظیمات ناموفق بود");
    },
  });

  const run = useMutation({
    mutationFn: () => runBackup("MANUAL"),
    onSuccess: () => { toast.success("بک‌آپ گرفته و سلامتش تأیید شد"); refresh(); },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      toast.error(err?.message ?? "گرفتن بک‌آپ ناموفق بود");
    },
  });

  if (status.isLoading || !draft) return <LoadingState />;
  if (status.isError) return <ErrorState onRetry={() => status.refetch()} />;

  const s = status.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="پشتیبان‌گیری"
        description="زمان‌بندی، محل ذخیره و سابقه‌ی بک‌آپ‌ها"
        icon={DatabaseBackup}
      />

      {/* وضعیت */}
      <Card
        className={`flex flex-wrap items-center justify-between gap-4 p-4 ${
          s.shouldRemind ? "border-amber-500 bg-amber-50/50" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          {s.shouldRemind ? (
            <ShieldAlert className="size-8 shrink-0 text-amber-600" />
          ) : (
            <ShieldCheck className="size-8 shrink-0 text-emerald-600" />
          )}
          <div>
            <p className="font-semibold">
              {s.lastSuccessAt
                ? s.shouldRemind
                  ? "از آخرین بک‌آپ زمان زیادی گذشته"
                  : "بک‌آپ به‌روز است"
                : "هنوز هیچ بک‌آپی گرفته نشده"}
            </p>
            <p className="text-sm text-muted-foreground">
              {s.lastSuccessAt
                ? `آخرین بک‌آپ موفق: ${faDate(s.lastSuccessAt)} — ${toFa(
                    s.hoursSinceLastBackup ?? 0
                  )} ساعت پیش`
                : "دیتابیس شما در حال حاضر هیچ نسخه‌ی پشتیبانی ندارد"}
            </p>
          </div>
        </div>

        <Button
          className="h-11"
          disabled={run.isPending || s.isRunning}
          onClick={() => run.mutate()}
        >
          {run.isPending || s.isRunning ? "در حال تهیه…" : "بک‌آپ بگیر"}
        </Button>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* تنظیمات */}
        <Card className="space-y-5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">بک‌آپ خودکار روزانه</p>
              <p className="text-xs text-muted-foreground">
                هر روز در ساعت مشخص‌شده اجرا می‌شود
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">ساعت اجرا</label>
            <div className="flex items-center gap-2">
              <Input
                dir="ltr"
                className="h-10 w-20 text-center tabular-nums"
                value={String(draft.hour).padStart(2, "0")}
                onChange={(e) =>
                  setDraft({ ...draft, hour: Math.min(23, Number(e.target.value.replace(/\D/g, "")) || 0) })
                }
              />
              <span className="text-muted-foreground">:</span>
              <Input
                dir="ltr"
                className="h-10 w-20 text-center tabular-nums"
                value={String(draft.minute).padStart(2, "0")}
                onChange={(e) =>
                  setDraft({ ...draft, minute: Math.min(59, Number(e.target.value.replace(/\D/g, "")) || 0) })
                }
              />
              <span className="text-xs text-muted-foreground">
                ساعتی را بگذارید که مغازه بسته است
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">محل ذخیره</label>
            <Input
              dir="ltr"
              className="text-left"
              placeholder="D:\backups\warehouse"
              value={draft.destination}
              onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
            />
            <p className="mt-1 text-xs leading-6 text-amber-700">
              ⚠️ این مسیر روی <b>سروری</b> است که دیتابیس روی آن اجرا می‌شود، نه روی
              این کامپیوتر. اگر سرور نتواند در آن بنویسد، همین حالا خطا می‌گیرید.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">تعداد نسخه</label>
              <Input
                dir="ltr"
                className="h-10 text-center tabular-nums"
                value={draft.keepCount}
                onChange={(e) =>
                  setDraft({ ...draft, keepCount: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">قدیمی‌ترها حذف می‌شوند</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">یادآوری بعد از</label>
              <Input
                dir="ltr"
                className="h-10 text-center tabular-nums"
                value={draft.remindAfterHours}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    remindAfterHours: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">ساعت، پیش از بستن برنامه</p>
            </div>
          </div>

          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}
          </Button>
        </Card>

        {/* سابقه */}
        <Card className="overflow-hidden p-0">
          <div className="border-b p-3 text-sm font-semibold">سابقه</div>
          {history.isLoading ? (
            <LoadingState />
          ) : !history.data?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              هنوز بک‌آپی گرفته نشده
            </p>
          ) : (
            <div className="max-h-[26rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>حجم</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{faDate(r.startedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {TRIGGER_LABELS[r.trigger] ?? r.trigger}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{mb(r.sizeBytes)}</TableCell>
                      <TableCell>
                        {r.status === "SUCCESS" ? (
                          <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                            {r.verified ? "سالم" : "بدون تأیید"}
                          </Badge>
                        ) : r.status === "FAILED" ? (
                          <Badge variant="destructive" title={r.error ?? ""}>ناموفق</Badge>
                        ) : (
                          <Badge variant="outline">در حال اجرا</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <p className="rounded-md border-e-4 border-e-primary bg-primary/5 p-3 text-xs leading-6">
        هر بک‌آپ پس از تهیه <b>خوانده می‌شود</b> تا مطمئن شویم فایل سالم است — بک‌آپی که
        باز نشود بک‌آپ نیست. توصیه: هر چند وقت یک‌بار یک نسخه را روی هارد بیرونی یا
        شبکه هم کپی کنید؛ اگر هارد سرور بسوزد، بک‌آپ کنارش هم می‌سوزد.
      </p>
    </div>
  );
}
