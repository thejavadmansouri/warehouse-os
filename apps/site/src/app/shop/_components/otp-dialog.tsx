"use client";

// ورودِ مشتری با کد پیامکی. دو مرحله: شماره → کد.
// ورود یک ماه اعتبار دارد (توکن در localStorage) تا سبدِ خرید وسطِ کار نپرد.
import * as React from "react";
import { toast } from "sonner";
import { Loader2, MessageSquareCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestOtp, verifyOtp } from "@/lib/shop-api";
import { useShopAuth } from "@/lib/shop-auth";
import { faToEn } from "@/lib/format";

export function OtpDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** بعد از موفقیتِ ورود — مثلاً ادامه‌ی ثبت سفارش. */
  onSuccess?: () => void;
}) {
  const setSession = useShopAuth((s) => s.setSession);

  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  // بستنِ دیالوگ state را ریست می‌کند تا دفعه‌ی بعد از نو شروع شود.
  const reset = React.useCallback(() => {
    setStep("phone");
    setPhone("");
    setName("");
    setCode("");
    setBusy(false);
    setError(null);
    setDevCode(null);
    setCooldown(0);
  }, []);

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitPhone = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    const p = faToEn(phone).trim();
    if (p.length < 10) {
      setError("شماره موبایل معتبر نیست");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await requestOtp(p);
      setDevCode(r.devCode ?? null);
      if (r.devCode) toast.info(`کد توسعه: ${r.devCode}`);
      setCooldown(r.expiresInSeconds);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال پیامک ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  // شماره‌ی تازه‌ای که هنوز مشتری نیست، همین‌جا با نامِ اختیاری ساخته می‌شود.
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await verifyOtp(faToEn(phone).trim(), faToEn(code).trim(), name.trim() || undefined);
      setSession(r.token, r.customer);
      setCode("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "کد اشتباه است");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareCode className="size-5 text-primary" aria-hidden />
            ورود / عضویت
          </DialogTitle>
          <DialogDescription>
            {step === "phone"
              ? "شماره موبایل را وارد کنید تا کد تأیید برایتان پیامک شود."
              : `کد ۵ رقمی که به ${faToEn(phone) ? phone : "شماره‌ی شما"} پیامک شد را وارد کنید.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={step === "phone" ? submitPhone : submitCode} className="space-y-4">
          {step === "phone" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="otp-phone">شماره موبایل</Label>
                <Input
                  id="otp-phone"
                  dir="ltr"
                  className="text-right tabular-nums"
                  inputMode="tel"
                  autoFocus
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="otp-name" className="text-muted-foreground">
                  نام (اختیاری — برای مشتریِ جدید)
                </Label>
                <Input
                  id="otp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً: علی رضایی"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="otp-code">کد تأیید</Label>
                <Input
                  id="otp-code"
                  dir="ltr"
                  className="text-right text-center text-2xl tabular-nums tracking-[0.5em]"
                  inputMode="numeric"
                  autoFocus
                  maxLength={5}
                  placeholder="•••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {devCode && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  کدِ توسعه: <span dir="ltr" className="font-mono">{devCode}</span>
                </p>
              )}
            </>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            <div className="flex items-center gap-2">
              {step === "code" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("phone")}
                    disabled={busy}
                  >
                    تعویض شماره
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={submitPhone}
                    disabled={busy || cooldown > 0}
                  >
                    {cooldown > 0 ? `ارسال مجدد (${cooldown})` : "ارسال مجدد"}
                  </Button>
                </>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={busy || (step === "code" && code.length !== 5)}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> در حال ارسال…
                  </>
                ) : step === "phone" ? (
                  "ارسال کد"
                ) : (
                  "ورود"
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}