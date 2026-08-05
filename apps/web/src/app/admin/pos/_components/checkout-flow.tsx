"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Check, Clock, UserRound } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchCustomers } from "@/lib/api";
import { money, parseNum, toFa, toman } from "@/lib/format";
import type { Customer, PaymentInput, PaymentMethod } from "@/lib/types";

/**
 * تسویه‌ی کامل با کیبورد — «اسکن → اینتر → مشتری → کارت → ثبت».
 *
 * فروشنده پشت پیشخوان دستش روی کیبورد و اسکنر است، نه ماوس. برای همین کل این
 * جریان با Enter جلو می‌رود و با Esc عقب. دو گام است، نه بیشتر:
 *
 *   ۱) مشتری  — تایپ کن و ↑↓ + Enter انتخاب کن؛ Enter روی خالی یعنی «نقدی گذری».
 *   ۲) پرداخت — کلید ۱..۳ روش را عوض می‌کند، Enter فاکتور را ثبت می‌کند.
 *
 * پرداخت ترکیبی و چک عمداً اینجا نیست: آن حالت نادر است و فرم مفصل خودش را
 * دارد (F7). این مسیر برای همان ۹۰٪ فروشی است که باید در چند ثانیه تمام شود.
 */

/**
 * کارت اول است و پیش‌فرض — بیشتر فروش‌ها با کارت‌خوان تسویه می‌شود، و پیش‌فرضِ
 * نقد یعنی فروشنده باید هر بار یک کلید اضافه بزند.
 */
const FAST_METHODS: { method: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { method: "CARD", label: "کارت", icon: CreditCard },
  { method: "CASH", label: "نقد", icon: Banknote },
  { method: "CREDIT", label: "نسیه", icon: Clock },
];

type Step = "customer" | "payment";

export function CheckoutFlow({
  open,
  total,
  lineCount,
  customer,
  pending,
  onCustomerChange,
  onSubmit,
  onOpenFullPayment,
  onClose,
}: {
  open: boolean;
  total: number;
  lineCount: number;
  customer: Customer | null;
  pending: boolean;
  onCustomerChange: (c: Customer | null) => void;
  onSubmit: (payments: PaymentInput[]) => void;
  /** فرار به فرم پرداخت کامل (ترکیبی/چک). */
  onOpenFullPayment: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("customer");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [received, setReceived] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  /**
   * فوکوسِ پشتیبان.
   *
   * وقتی روش پرداخت «کارت» یا «نسیه» است خانه‌ی مبلغ اصلاً رندر نمی‌شود. اگر
   * فوکوس روی body بیفتد، رویداد کیبورد به onKeyDownِ این دیالوگ نمی‌رسد و
   * Enter کار نمی‌کند. پس خودِ محتوا فوکوس‌پذیر است و پناهگاه فوکوس می‌شود.
   */
  const contentRef = useRef<HTMLDivElement>(null);

  // هر بار که باز می‌شود از گام اول و با حالت پیش‌فرضِ رایج شروع کن.
  useEffect(() => {
    if (!open) return;
    setStep("customer");
    setQ("");
    setDebounced("");
    setHighlight(0);
    setMethod("CARD");
    setReceived(total);
  }, [open, total]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ["checkout-customers", debounced],
    queryFn: () => searchCustomers(debounced),
    enabled: open && step === "customer" && debounced.trim().length > 0,
  });

  const list = useMemo(() => results.data ?? [], [results.data]);

  useEffect(() => setHighlight(0), [debounced]);

  // فوکوس همیشه جایی باشد که تایپ بعدی باید برود.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (step === "customer") searchRef.current?.focus();
      else (amountRef.current ?? contentRef.current)?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [open, step, method]);

  /** نسیه بدون مشتری معنا ندارد — سرور هم ردش می‌کند. */
  const creditNeedsCustomer = method === "CREDIT" && !customer;
  const change = method === "CASH" ? Math.max(0, received - total) : 0;
  const shortPaid = method !== "CREDIT" && received < total;
  const canSubmit = !pending && !creditNeedsCustomer && !shortPaid && lineCount > 0;

  const buildPayments = (): PaymentInput[] => {
    if (method === "CREDIT") return [{ method: "CREDIT", amount: total }];
    // نقدِ بیشتر از مبلغ = پول خرد؛ چیزی که ثبت می‌شود خودِ مبلغ فاکتور است.
    return [{ method, amount: total }];
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Escape اینجا نیست: Radix آن را روی document می‌گیرد و preventDefaultِ
    // رویدادِ ری‌اکت جلویش را نمی‌گیرد. مدیریتش در onEscapeKeyDown است.
    if (step === "customer") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, Math.max(0, list.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        // چیزی تایپ شده و نتیجه‌ای هست → همان را بردار. وگرنه نقدی گذری.
        if (list.length > 0 && debounced.trim()) onCustomerChange(list[highlight] ?? null);
        setStep("payment");
      }
      return;
    }

    // گام پرداخت
    if (e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) onSubmit(buildPayments());
      return;
    }

    // جهت‌دارها همیشه روش پرداخت را عوض می‌کنند — با تایپِ مبلغ تداخل ندارند.
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const i = FAST_METHODS.findIndex((m) => m.method === method);
      // چیدمان راست‌به‌چپ است: فلشِ چپ یعنی جلو.
      const next = e.key === "ArrowLeft" ? i + 1 : i - 1;
      const picked = FAST_METHODS[(next + FAST_METHODS.length) % FAST_METHODS.length];
      if (picked) setMethod(picked.method);
      return;
    }

    // ۱..۳ فقط وقتی فوکوس در خانه‌ی مبلغ نیست، وگرنه رقمِ مبلغ را می‌خورد.
    if (e.key >= "1" && e.key <= "3" && document.activeElement !== amountRef.current) {
      e.preventDefault();
      const picked = FAST_METHODS[Number(e.key) - 1];
      if (picked) setMethod(picked.method);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        className="max-w-2xl gap-0 p-0"
        onKeyDown={onKeyDown}
        /* Radix پیش‌فرض روی اولین عنصر فوکوس می‌گذارد؛ خودمان مدیریتش می‌کنیم. */
        onOpenAutoFocus={(e) => e.preventDefault()}
        /* Esc در گام پرداخت یعنی «یک گام عقب»، نه «بستن کل تسویه». */
        onEscapeKeyDown={(e) => {
          if (step === "payment") {
            e.preventDefault();
            setStep("customer");
          }
        }}
      >
        {/* سربرگ: مبلغ بزرگ‌ترین چیز روی صفحه است. */}
        <div className="flex items-baseline justify-between border-b bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <StepDot active={step === "customer"} done={step === "payment"} label="مشتری" n={1} />
            <div className="h-px w-6 bg-border" />
            <StepDot active={step === "payment"} done={false} label="پرداخت" n={2} />
          </div>
          <div className="text-end">
            <div className="text-3xl font-bold tabular-nums">{money(total)}</div>
            <div className="text-xs text-muted-foreground">
              تومان · {toFa(lineCount)} قلم
            </div>
          </div>
        </div>

        {step === "customer" ? (
          <div className="flex flex-col gap-3 p-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="size-4" /> مشتری
            </label>
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              /* کوتاه نگه داشته شده: متن بلندتر در این عرض از سرِ خودش بریده می‌شد.
                 راهنمای «Enter = نقدی» زیرِ همین فیلد آمده است. */
              placeholder="نام یا شماره تماس مشتری"
              className="h-12 text-base"
            />

            <div className="min-h-32">
              {debounced.trim() && list.length === 0 && !results.isLoading && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  مشتری‌ای پیدا نشد — Enter بزنید تا بدون مشتری ادامه دهد
                </p>
              )}

              {!debounced.trim() && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  برای فروش نقدی، فقط Enter بزنید
                </p>
              )}

              <div className="flex flex-col gap-1">
                {list.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onCustomerChange(c); setStep("payment"); }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`flex items-center justify-between rounded-lg border p-2.5 text-right transition-colors ${
                      i === highlight ? "border-primary bg-primary/5" : "border-transparent"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.fullName}</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">
                        {c.phones?.[0]?.phone ? toFa(c.phones[0].phone) : "بدون شماره"}
                      </span>
                    </span>
                    {!!c.summary?.totalDue && (
                      <span className="shrink-0 text-xs tabular-nums text-amber-600">
                        بدهی {toman(c.summary.totalDue)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <FooterHint
              hints={[
                ["Enter", list.length && debounced.trim() ? "انتخاب و ادامه" : "بدون مشتری، ادامه"],
                ["↑↓", "جابه‌جایی"],
                ["Esc", "بازگشت به سبد"],
              ]}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-5">
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{customer.fullName}</span>
                {!!customer.summary?.totalDue && (
                  <span className="text-xs tabular-nums text-amber-600">
                    بدهی قبلی {toman(customer.summary.totalDue)}
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                فروش نقدیِ گذری — بدون مشتری
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {FAST_METHODS.map((m, i) => {
                const Icon = m.icon;
                const active = method === m.method;
                return (
                  <button
                    key={m.method}
                    type="button"
                    onClick={() => setMethod(m.method)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    <Icon className="size-5" />
                    <span className="text-sm font-medium">{m.label}</span>
                    <span
                      className={`text-[11px] ${
                        active ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      کلید {toFa(i + 1)}
                    </span>
                  </button>
                );
              })}
            </div>

            {method === "CASH" && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">مبلغ دریافتی</span>
                <div className="flex items-center gap-3">
                  <Input
                    ref={amountRef}
                    dir="ltr"
                    inputMode="numeric"
                    className="h-11 w-40 text-left text-lg tabular-nums"
                    value={received ? money(received) : ""}
                    onChange={(e) => setReceived(parseNum(e.target.value))}
                  />
                  <div className="w-32 text-end">
                    <div className="text-xs text-muted-foreground">باقی‌مانده مشتری</div>
                    <div className="text-lg font-bold tabular-nums">{money(change)}</div>
                  </div>
                </div>
              </div>
            )}

            {creditNeedsCustomer && (
              <p className="text-sm text-destructive">
                فروش نسیه بدون مشتری ممکن نیست — با Esc برگردید و مشتری را انتخاب کنید.
              </p>
            )}
            {shortPaid && !creditNeedsCustomer && (
              <p className="text-sm text-destructive">
                مبلغ دریافتی از مبلغ فاکتور کمتر است.
              </p>
            )}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmit(buildPayments())}
              className="flex h-14 items-center justify-center gap-2 rounded-lg bg-primary text-base
                         font-semibold text-primary-foreground transition-opacity
                         hover:opacity-90 disabled:opacity-40"
            >
              <Check className="size-5" />
              {pending ? "در حال ثبت…" : `ثبت فاکتور — ${money(total)} تومان`}
            </button>

            <button
              type="button"
              onClick={onOpenFullPayment}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              پرداخت ترکیبی یا چک؟ فرم کامل را باز کنید
            </button>

            <FooterHint
              hints={[
                ["Enter", "ثبت فاکتور"],
                ["→ ←", "روش پرداخت"],
                ["Esc", "بازگشت به مشتری"],
              ]}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepDot({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
          active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check className="size-3.5" /> : toFa(n)}
      </span>
      <span className={`text-sm ${active ? "font-semibold" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

/** نوار راهنمای کلیدها — مثل صندوق‌های فروش واقعی، همیشه جلوی چشم. */
function FooterHint({ hints }: { hints: [string, string | number][] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      {hints.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px]">
            {key}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
