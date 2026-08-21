"use client";

/**
 * پیامک به یک مشتری — دستی، با پیش‌نمایش اجباری.
 *
 * سه چیز که عمدی‌اند:
 *
 * **پیش‌نمایش اختیاری نیست.** پیامک برگشت‌ناپذیر است و پول دارد؛ مدیر باید
 * همان چیزی را ببیند که مشتری می‌بیند، نه قالبِ خام را.
 *
 * **تاریخچه کنارِ فرمِ ارسال است، نه در صفحه‌ی دیگر.** بدون آن، دو نفر در یک
 * روز یک یادآوری بدهی را دو بار می‌فرستند و مشتری فکر می‌کند طلبکاری می‌کنی.
 *
 * **همه‌ی ردها سمت سرور می‌افتند** (انصراف مشتری، نداشتن موبایل، قالب خاموش،
 * سقف روزانه). اینجا فقط نمایش داده می‌شوند — چون همان endpoint از جای دیگر
 * هم صدا زده می‌شود و UI نمی‌تواند تنها نگهبان باشد.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  drainSms,
  getSmsHistory,
  getSmsTemplates,
  previewSms,
  retrySms,
  sendSms,
} from "@/lib/api";
import type { Customer } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { formatDateTime, toFa } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "در صف",
  SENT: "ارسال شد",
  FAILED: "ناموفق",
  CANCELLED: "لغو شد",
};

export function SmsDialog({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [templateKey, setTemplateKey] = React.useState("");
  /** متنِ قابل ویرایش — مدیر می‌تواند پیش از ارسال دستکاری‌اش کند. */
  const [body, setBody] = React.useState("");

  const templates = useQuery({
    queryKey: ["sms-templates"],
    queryFn: getSmsTemplates,
    enabled: open,
  });

  const history = useQuery({
    queryKey: ["sms-history", customer.id],
    queryFn: () => getSmsHistory(customer.id),
    enabled: open,
  });

  const preview = useQuery({
    queryKey: ["sms-preview", customer.id, templateKey],
    queryFn: () => previewSms(customer.id, templateKey),
    enabled: open && templateKey !== "",
  });

  // متنِ پیش‌نمایش وارد جعبه می‌شود تا قابل ویرایش باشد.
  React.useEffect(() => {
    if (preview.data) setBody(preview.data.body);
  }, [preview.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sms-history", customer.id] });
  };

  const send = useMutation({
    mutationFn: async () => {
      const msg = await sendSms({ customerId: customer.id, templateKey, body });
      // بلافاصله صف را خالی کن — مدیر ایستاده و منتظر است.
      await drainSms().catch(() => null);
      return msg;
    },
    onSuccess: () => {
      toast.success("پیامک فرستاده شد");
      setTemplateKey("");
      setBody("");
      refresh();
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "ارسال پیامک ناموفق بود"),
  });

  const again = useMutation({
    mutationFn: async (id: string) => {
      await retrySms(id);
      await drainSms().catch(() => null);
    },
    onSuccess: () => {
      toast.success("دوباره فرستاده شد");
      refresh();
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "تلاش دوباره ناموفق بود"),
  });

  const noMobile = preview.data?.phone == null;
  const blocked = customer.smsOptOut || noMobile;
  const canSend =
    templateKey !== "" && body.trim().length >= 5 && !blocked && !send.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquare className="size-4" />
          پیامک
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>پیامک به {customer.fullName}</DialogTitle>
          <DialogDescription>
            قالب را انتخاب کنید، متن را ببینید و در صورت لزوم ویرایش کنید.
          </DialogDescription>
        </DialogHeader>

        {/* دلیلِ نرفتن، پیش از هر کار دیگری. */}
        {customer.smsOptOut && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-4 shrink-0" />
            این مشتری پیامک نمی‌خواهد. برای تغییر، از ویرایش مشتری اقدام کنید.
          </div>
        )}
        {!customer.smsOptOut && noMobile && preview.data && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            شماره موبایلی ثبت نشده. پیامک فقط به موبایل می‌رود، نه تلفن ثابت.
          </div>
        )}

        <div className="space-y-3">
          <Select value={templateKey} onValueChange={setTemplateKey}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب قالب…" />
            </SelectTrigger>
            <SelectContent>
              {(templates.data ?? [])
                .filter((t) => t.isActive)
                .map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {preview.isFetching ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin" /> در حال آماده‌سازی متن…
            </div>
          ) : templateKey ? (
            <>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="text-sm"
              />

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {preview.data?.phone && (
                  <span dir="ltr" className="font-mono">
                    {toFa(preview.data.phone)}
                  </span>
                )}
                <span>{toFa(body.length)} کاراکتر</span>
                {/* متغیری که مقدار نگرفته در متن خام می‌ماند — نباید فرستاده شود. */}
                {(preview.data?.missingVars.length ?? 0) > 0 && (
                  <Badge variant="destructive">
                    مقدار ندارد: {preview.data!.missingVars.join("، ")}
                  </Badge>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* تاریخچه — تا کسی یک یادآوری را دو بار نفرستد. */}
        <div className="max-h-56 space-y-1.5 overflow-y-auto border-t pt-3">
          {history.isLoading ? (
            <div className="py-3 text-center text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin" />
            </div>
          ) : !history.data?.length ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              تا حالا پیامکی فرستاده نشده.
            </p>
          ) : (
            history.data.map((m) => (
              <div key={m.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      m.status === "SENT"
                        ? "secondary"
                        : m.status === "FAILED"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {STATUS_LABEL[m.status] ?? m.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {m.template?.title ?? "—"} · {formatDateTime(m.createdAt)}
                  </span>
                  {m.status === "FAILED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mr-auto h-7"
                      disabled={again.isPending}
                      onClick={() => again.mutate(m.id)}
                    >
                      <RotateCcw className="size-3.5" />
                      دوباره
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.body}</p>
                {m.error && (
                  <p className="mt-1 text-xs text-destructive">{m.error}</p>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            بستن
          </Button>
          <Button disabled={!canSend} onClick={() => send.mutate()}>
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-4" />
                ارسال
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
