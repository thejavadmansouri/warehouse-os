"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Check, Clock, UserRound } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { MoneyInput } from "@/components/money-input";
import { toast } from "sonner";

import { createCustomer, creditCheck, searchCustomers } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, faToEn, money, toFa, rial } from "@/lib/format";
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
  { method: "CREDIT", label: "حساب‌باز", icon: Clock },
];

/**
 * مهلت‌های پرداخت.
 *
 * فروشنده عدد تایپ نمی‌کند، از بین چند گزینه‌ی رایج یکی را برمی‌دارد — و در
 * حالت عادی حتی همین را هم نمی‌کند، چون پیش‌فرض از خودِ مشتری می‌آید.
 * export است تا فرم پرداخت کامل (F7) هم همین گزینه‌ها را داشته باشد و دو مسیر
 * از هم جدا نیفتند.
 */
export const CREDIT_TERMS = [0, 7, 15, 30, 45, 60, 90];

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
  /** `dueDate` فقط برای حساب‌باز پر می‌شود. */
  onSubmit: (payments: PaymentInput[], dueDate?: string) => void;
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
  /** مهلت پرداختِ همین فروش. null یعنی «هنوز دست نخورده، از مشتری بگیر». */
  const [creditDays, setCreditDays] = useState<number | null>(null);
  /**
   * سررسیدِ دستی (ISO). وقتی پر باشد بر مهلتِ روزشمار می‌چربد.
   *
   * لازم است چون مشتری گاهی تاریخ می‌گوید نه مدت — «چک را می‌دهم پانزدهم
   * مهر»، نه «چهل روز دیگر». اجبار به تبدیلِ ذهنی یعنی خطا.
   */
  const [customDue, setCustomDue] = useState("");

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
    /*
     * مشتری از قبل روی فاکتور انتخاب شده ⇒ گام مشتری اصلاً نشان داده نمی‌شود.
     *
     * پرسیدن دوباره‌ی چیزی که کاربر همین الان جواب داده، هم یک Enter اضافه است
     * هم این حس را می‌دهد که نرم‌افزار حرفش را نشنیده. با Esc باز هم می‌شود
     * برگشت و عوضش کرد.
     */
    setStep(customer ? "payment" : "customer");
    setQ("");
    setDebounced("");
    setHighlight(0);
    setMethod("CARD");
    setReceived(total);
    setCreditDays(null);
    setCustomDue("");
    // عمداً به `customer` وابسته نیست: اگر بود، انتخاب مشتری در گام اول
    // بلافاصله همین افکت را دوباره اجرا می‌کرد و حالت را از نو می‌ریخت.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** حساب‌باز بدون مشتری معنا ندارد — سرور هم ردش می‌کند. */
  const creditNeedsCustomer = method === "CREDIT" && !customer;
  const change = method === "CASH" ? Math.max(0, received - total) : 0;
  const shortPaid = method !== "CREDIT" && received < total;
  const canSubmit = !pending && !creditNeedsCustomer && !shortPaid && lineCount > 0;

  /**
   * مهلت مؤثر: چیزی که فروشنده انتخاب کرده، وگرنه مهلت همیشگیِ خودِ مشتری.
   * این‌طور فروشنده در حالت عادی هیچ چیزی انتخاب نمی‌کند.
   */
  const effectiveDays = creditDays ?? customer?.creditDays ?? 0;

  /** سررسید = پایانِ روزِ n اُم. پایان روز، وگرنه صبحِ همان روز «معوق» می‌شود. */
  const dueDate = useMemo(() => {
    const d = customDue ? new Date(customDue) : new Date();
    if (!customDue) d.setDate(d.getDate() + effectiveDays);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [effectiveDays, customDue]);

  /*
   * هشدار اعتبار — فقط وقتی واقعاً حساب‌باز انتخاب شده.
   *
   * عمداً روی هر تغییرِ مبلغ صدا زده نمی‌شود: مبلغ در این گام ثابت است و
   * فروشنده فقط روش پرداخت را عوض می‌کند.
   */
  const credit = useQuery({
    queryKey: ["credit-check", customer?.id, total],
    queryFn: () => creditCheck(customer!.id, total),
    enabled: open && step === "payment" && method === "CREDIT" && !!customer?.id,
  });

  /**
   * آنچه تایپ شده شماره‌ی تلفن است، نه اسم.
   *
   * فروشنده اغلب اسم مشتری را نمی‌داند ولی شماره‌اش را دارد. تا حالا این حالت
   * می‌افتاد روی «نقدی گذری» و شماره برای همیشه از دست می‌رفت — یعنی همان
   * مشتری دفعه‌ی بعد هم گذری می‌شد و هیچ‌وقت سابقه‌ای نداشت.
   *
   * ارقام فارسی هم پذیرفته می‌شود و ۹۸+ به صفر برمی‌گردد، چون همان شکلِ
   * نرمال‌شده‌ای است که سرور ذخیره می‌کند.
   */
  const typedDigits = faToEn(debounced).replace(/\D/g, "");
  const typedPhone = typedDigits.replace(/^98/, "0").replace(/^9/, "09");
  const looksLikePhone =
    /^[\d\s+\-()۰-۹]+$/.test(debounced.trim()) && typedDigits.length >= 10;
  /**
   * چیزی تایپ شده که به هیچ مشتریِ موجودی نمی‌خورد — چه اسم، چه شماره.
   *
   * تا حالا هر دو حالت می‌افتاد روی «نقدی گذری» و آنچه فروشنده تایپ کرده بود
   * دور ریخته می‌شد. یعنی همان مشتری دفعه‌ی بعد هم گذری می‌شد و هیچ‌وقت سابقه
   * و حسابی پیدا نمی‌کرد.
   */
  const isNewCustomer =
    debounced.trim().length > 0 && !results.isFetching && list.length === 0;

  const quickCreate = useMutation({
    mutationFn: () => {
      // شماره تایپ شده: اسم همان شماره می‌شود، چون چیز دیگری از او نمی‌دانیم
      // و یک نامِ ساختگی بعداً فقط گیج‌کننده است.
      if (looksLikePhone) {
        return createCustomer({
          firstName: toFa(typedPhone),
          phones: [{ phone: typedPhone, isPrimary: true }],
        });
      }

      // اسم تایپ شده: تا اولین فاصله نام، بقیه فامیل. جداکردنشان لازم است
      // چون جست‌وجو و مرتب‌سازیِ فهرست مشتریان روی فامیل کار می‌کند.
      const typed = debounced.trim().replace(/\s+/g, " ");
      const sp = typed.indexOf(" ");
      return createCustomer(
        sp > 0
          ? { firstName: typed.slice(0, sp), lastName: typed.slice(sp + 1) }
          : { firstName: typed }
      );
    },
    onSuccess: (c) => {
      onCustomerChange(c);
      setStep("payment");
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiException ? e.message : "ثبت مشتری با شماره ناموفق بود"
      ),
  });

  const buildPayments = (): PaymentInput[] => {
    if (method === "CREDIT") return [{ method: "CREDIT", amount: total }];
    // نقدِ بیشتر از مبلغ = پول خرد؛ چیزی که ثبت می‌شود خودِ مبلغ فاکتور است.
    return [{ method, amount: total }];
  };

  /** سررسید فقط برای حساب‌باز فرستاده می‌شود. */
  const submit = () =>
    onSubmit(
      buildPayments(),
      method === "CREDIT" ? dueDate.toISOString() : undefined
    );

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
        if (quickCreate.isPending) return;

        // نتیجه‌ای هست → همان را بردار.
        if (list.length > 0 && debounced.trim()) {
          onCustomerChange(list[highlight] ?? null);
          setStep("payment");
          return;
        }

        // چیزی تایپ شده و به کسی نخورد → همان را به‌عنوان مشتری تازه ثبت کن.
        // خودِ mutation بعد از موفقیت گام را جلو می‌برد.
        if (isNewCustomer) {
          quickCreate.mutate();
          return;
        }

        // فیلد خالی → واقعاً فروش گذری است.
        setStep("payment");
      }
      return;
    }

    // گام پرداخت
    if (e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) submit();
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
              ریال · {toFa(lineCount)} قلم
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
              {/* ناشناس: Enter همان اسم یا شماره را ثبت می‌کند، نه گذری. */}
              {isNewCustomer && (
                <div className="rounded-lg border border-blue-500 bg-blue-50 p-3 text-center
                                dark:bg-blue-950/30">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    مشتری تازه:{" "}
                    {looksLikePhone ? toFa(typedPhone) : debounced.trim()}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {quickCreate.isPending
                      ? "در حال ثبت…"
                      : "Enter بزنید تا ثبت شود و فاکتور به نامش بخورد"}
                  </p>
                </div>
              )}

              {!debounced.trim() && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  برای فروش نقدی، فقط Enter بزنید — یا نام/شماره‌ی مشتری را بنویسید
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
                        بدهی {rial(c.summary.totalDue)}
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
                    بدهی قبلی {rial(customer.summary.totalDue)}
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
                  <MoneyInput
                    ref={amountRef}
                    className="h-11 w-40 text-left text-lg tabular-nums"
                    value={received}
                    onChange={setReceived}
                  />
                  <div className="w-32 text-end">
                    <div className="text-xs text-muted-foreground">باقی‌مانده مشتری</div>
                    <div className="text-lg font-bold tabular-nums">{money(change)}</div>
                  </div>
                </div>
              </div>
            )}

            {/*
              پنل حساب‌باز.

              عمداً فقط سه چیز: مهلت، سررسید، و هشدار اعتبار. فروشنده نباید
              حسابداری بداند — بدهی و سررسید را خودِ سیستم می‌سازد.
            */}
            {method === "CREDIT" && customer && (
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                <div>
                  <span className="mb-2 block text-sm text-muted-foreground">
                    مهلت پرداخت
                  </span>
                  {/* چیپ به‌جای کشویی: انتخاب یک‌کلیکی، و همه‌ی گزینه‌ها هم‌زمان دیده می‌شوند. */}
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set([...CREDIT_TERMS, customer?.creditDays ?? 0])]
                      .sort((a, b) => a - b)
                      .map((d) => {
                        const active = !customDue && effectiveDays === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => { setCustomDue(""); setCreditDays(d); }}
                            className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
                              active
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "hover:border-blue-500 hover:text-blue-600"
                            }`}
                          >
                            {d === 0 ? "همان روز" : `${toFa(d)} روز`}
                          </button>
                        );
                      })}

                    <button
                      type="button"
                      onClick={() =>
                        setCustomDue((v) => v || new Date().toISOString().slice(0, 10))
                      }
                      className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
                        customDue
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "hover:border-blue-500 hover:text-blue-600"
                      }`}
                    >
                      سفارشی
                    </button>
                  </div>
                </div>

                {customDue && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">تاریخ سررسید</span>
                    <JalaliDateInput value={customDue} onChange={setCustomDue} />
                  </div>
                )}

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-muted-foreground">سررسید</span>
                  <span className="text-base font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                    {faDate(dueDate.toISOString())}
                  </span>
                </div>

                {credit.data?.exceeded && (
                  <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                    ⚠️ این فروش {rial(credit.data.exceededBy)} از سقف اعتبار
                    مشتری عبور می‌کند. ثبت می‌شود، ولی حواستان باشد.
                  </p>
                )}

                {credit.data && !credit.data.exceeded && credit.data.available !== null && (
                  <p className="text-xs text-muted-foreground">
                    اعتبار باقی‌مانده پس از این فروش:{" "}
                    <span className="tabular-nums">
                      {rial(credit.data.available - total)}
                    </span>
                  </p>
                )}
              </div>
            )}

            {creditNeedsCustomer && (
              <p className="text-sm text-destructive">
                فروش حساب‌باز بدون مشتری ممکن نیست — با Esc برگردید و مشتری را انتخاب کنید.
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
              onClick={submit}
              className="flex h-14 items-center justify-center gap-2 rounded-lg bg-primary text-base
                         font-semibold text-primary-foreground transition-opacity
                         hover:opacity-90 disabled:opacity-40"
            >
              <Check className="size-5" />
              {pending ? "در حال ثبت…" : `ثبت فاکتور — ${money(total)} ریال`}
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
