"use client";

// ویرایش قالب‌های پیامک — فقط ADMIN/MANAGER (همان گیتِ اندپوینت PATCH).
// هر قالب یک کارت است: عنوان، متن، کلید فعال/غیرفعال، چیپِ متغیرهای مجاز،
// شمارنده‌ی کاراکتر و دکمه‌ی «بازنشانی به متن اصلی». کلید (key) فقط نمایش داده
// می‌شود — قراردادِ کد است و هرگز قابل تغییر نیست.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, RotateCcw, Save, Send } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { getSmsTemplates, updateSmsTemplate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ApiException } from "@/lib/api-error-messages";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toFa } from "@/lib/format";
import type { SmsTemplate } from "@/lib/types";

// سقفِ مرسومِ پنل‌های پیامک‌کوتاه — بالاتر از آن پیامک «بلند» و چندبخشی است.
const SMS_LONG_THRESHOLD = 320;

/**
 * مقادیرِ نمونه برای «ارسال آزمایشی» — فقط نمایشِ پیش‌نمایش؛ هیچ پیامکی
 * واقعاً ارسال نمی‌شود. این‌ها داده‌ی نمایشی‌اند؛ فهرستِ متغیرهای مجازِ هر
 * قالب همچنان از بک‌اند می‌آید (template.vars).
 */
const SAMPLE_VALUES: Record<string, string> = {
  customer: "مشتری نمونه",
  shop: "فروشگاه نمونه",
  balance: "۵۰۰٬۰۰۰",
  amount: "۱٬۲۵۰٬۰۰۰",
  chequeNumber: "۲۳۴۵۶۷",
  dueDate: "۱۴۰۴/۰۵/۱۵",
  invoiceNumber: "۱۰۲۴",
  product: "لنت ترمز جلو",
};

/** جای‌گذاری متغیرها با مقادیر نمونه — متغیرِ بی‌مقدار دست‌نخورده می‌ماند (مثل renderTemplate سمت سرور). */
function renderSample(body: string): string {
  return body.replace(/\{(\w+)\}/g, (whole, name: string) => SAMPLE_VALUES[name] ?? whole);
}

function TemplateCard({
  template,
  onSaved,
}: {
  template: SmsTemplate;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState(template.title);
  const [body, setBody] = React.useState(template.body);
  const [isActive, setIsActive] = React.useState(template.isActive);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  // نسخه‌ی ذخیره‌شده‌ی محلی — بعد از هر ذخیره‌ی موفق به‌روز می‌شود تا دکمه
  // فقط وقتی فعال باشد که واقعاً تغییری مانده باشد.
  const saved = React.useRef({
    title: template.title,
    body: template.body,
    isActive: template.isActive,
  });

  const dirty =
    title !== saved.current.title ||
    body !== saved.current.body ||
    isActive !== saved.current.isActive;

  const saveMut = useMutation({
    mutationFn: () =>
      updateSmsTemplate(template.id, {
        // فیلدی که عوض نشده فرستاده نمی‌شود — «عوض نکن»، نه «صفر کن».
        ...(title !== saved.current.title ? { title } : {}),
        ...(body !== saved.current.body ? { body } : {}),
        ...(isActive !== saved.current.isActive ? { isActive } : {}),
      }),
    onSuccess: (r) => {
      saved.current = { title: r.title, body: r.body, isActive: r.isActive };
      setTitle(r.title);
      setBody(r.body);
      setIsActive(r.isActive);
      toast({ title: "قالب ذخیره شد", description: r.title });
      onSaved();
    },
    onError: (e: unknown) => {
      // پیامِ سرور (مثلاً EMPTY_BODY) همان‌طور که هست نمایش داده می‌شود.
      const msg = e instanceof ApiException ? e.message : "خطا در ذخیره‌ی قالب";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  const bodyLen = body.length;
  const tooLong = bodyLen > SMS_LONG_THRESHOLD;
  const sampleBody = renderSample(body);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{title || "بدون عنوان"}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
              <span>کلید:</span>
              <Badge variant="outline" className="font-mono text-[11px]">
                {template.key}
              </Badge>
            </CardDescription>
          </div>
          <Badge
            variant={isActive ? "default" : "secondary"}
            className="shrink-0"
          >
            {isActive ? "فعال" : "غیرفعال"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`title-${template.id}`}>عنوان</Label>
          <Input
            id={`title-${template.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor={`body-${template.id}`}>متن پیامک</Label>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs ${
                  tooLong
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {toFa(bodyLen)} کاراکتر
                {tooLong ? " — پیامک بلند، هزینه‌ی چندبخشی دارد" : ""}
              </span>
              {template.defaultBody ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => setBody(template.defaultBody!)}
                  disabled={body === template.defaultBody || saveMut.isPending}
                  title="بازگرداندن متن به مقدار اولیه‌ی تعریف قالب"
                >
                  <RotateCcw className="h-3 w-3" />
                  بازنشانی به متن اصلی
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => setPreviewOpen(true)}
                title="پیش‌نمایش متنِ نهایی با مقادیر نمونه — بدون ارسال واقعی"
              >
                <Send className="h-3 w-3" />
                ارسال آزمایشی
              </Button>
            </div>
          </div>
          <Textarea
            id={`body-${template.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
          />
        </div>

        {/* متغیرهای مجاز — از تعریف قالبِ بک‌اند می‌آیند، اینجا hardcode نشده‌اند. */}
        {template.vars && template.vars.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              متغیرهای مجاز — در متن با {`{نام}`} جای‌گذاری می‌شوند:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {template.vars.map((v) => (
                <Badge key={v} variant="secondary" className="font-mono text-[11px]">
                  {`{${v}}`}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`active-${template.id}`}
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor={`active-${template.id}`} className="text-sm">
              ارسال با این قالب فعال باشد
            </Label>
          </div>
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
          >
            {saveMut.isPending ? (
              <LoadingState className="py-0" />
            ) : (
              <>
                <Save className="h-4 w-4" />
                ذخیره
              </>
            )}
          </Button>
        </div>
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>پیش‌نمایش قالب «{title}»</DialogTitle>
            <DialogDescription>
              متنِ نهایی با مقادیر نمونه — هیچ پیامکی ارسال نمی‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl rounded-ss-sm bg-primary/10 p-4 text-sm leading-relaxed">
            {sampleBody}
          </div>

          {template.vars && template.vars.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                مقادیرِ نمونه‌ی متغیرها:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {template.vars.map((v) => (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="gap-1.5 font-mono text-[11px]"
                  >
                    {`{${v}}`}
                    <span className="font-sans font-normal text-muted-foreground">
                      ← {SAMPLE_VALUES[v] ?? "—"}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {sampleBody.includes("{") ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              متغیرهایی که مقدارِ نمونه ندارند، دست‌نخورده نشان داده شده‌اند.
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** داخلِ صفحه‌ی میزبان سرتیترِ خودش را نشان نمی‌دهد. */
export function SmsTemplatesPanel({ embedded }: { embedded?: boolean } = {}) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["sms-templates"],
    queryFn: getSmsTemplates,
  });

  if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>دسترسی غیرمجاز</AlertTitle>
          <AlertDescription>
            ویرایش قالب‌های پیامک فقط برای نقش‌های ADMIN و MANAGER است.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact={embedded}
        title="قالب‌های پیامک"
        description="متنِ پیامک‌هایی که برای مشتری فرستاده می‌شود — کلید هر قالب ثابت است"
        icon={MessageSquareText}
      />

      {q.isLoading ? (
        <LoadingState label="در حال بارگذاری قالب‌ها..." />
      ) : q.isError ? (
        <ErrorState
          message="خطا در بارگذاری قالب‌های پیامک"
          onRetry={() => q.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {q.data?.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onSaved={() => qc.invalidateQueries({ queryKey: ["sms-templates"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function SmsTemplatesPage() {
  return <SmsTemplatesPanel />;
}
