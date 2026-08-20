"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  HandCoins,
  PencilLine,
  Plus,
  Printer,
  Search,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/money-input";
import {
  createCustomer,
  ensureOpenAccount,
  getCustomer,
  getOpenAccount,
  listOpenAccounts,
  searchCustomers,
  settleOpenAccount,
  updateCustomer,
} from "@/lib/api";
import { ReceiptForm } from "@/components/receipt-form";
import { ReturnDialog } from "./return-dialog";
import { CorrectionDialog } from "./correction-dialog";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, faToEn, money, toFa } from "@/lib/format";
import type { Customer, OpenAccountDetail, OpenAccountSummary } from "@/lib/types";

type View = "list" | "file" | "define" | "receipt";

/** مهلتهای رایج برای تعریف حساب باز. */
const CREDIT_TERMS = [0, 7, 15, 30, 45, 60, 90];

/** پروندهی کامل → ردیفِ فهرست، تا نمای پرونده بدونِ رفتوبرگشت باز شود. */
function toSummary(a: OpenAccountDetail): OpenAccountSummary {
  return {
    id: a.id,
    number: a.number,
    customerId: a.customerId,
    customerName: a.customerName,
    phone: a.phone,
    status: a.status,
    total: a.total,
    invoiceCount: a.invoiceCount,
    firstVisit: a.invoices[0]?.createdAt ?? null,
    lastVisit: a.invoices.at(-1)?.createdAt ?? null,
    createdAt: a.createdAt,
  };
}

/**
 * حسابهای باز — «فاکتور کلیِ» مشتری که تا تسویه نهایی نمیشود.
 *
 * هر نوبت خرید یک فاکتورِ OPEN جداگانه (با شماره و تاریخِ خودش) داخل همین حساب
 * است. چهار نما: فهرستِ حسابها (با جستوجو در همهی مشتریان)، پروندهی یک حساب،
 * تعریفِ حساب برای مشتریِ تازه، و دریافتِ پول بعد از تسویه.
 *
 * «ادامهی فاکتور» صندوق را روی همان حساب میگذارد تا نوبتِ بعدی هم به همان حساب
 * برود؛ «تسویه» همهی فاکتورهای باز را نهایی میکند و بلافاصله فرمِ دریافت میآید.
 */
export function OpenAccounts({
  open,
  onContinue,
  onClose,
}: {
  open: boolean;
  onContinue: (account: OpenAccountSummary) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<OpenAccountSummary | null>(null);

  // ---- فهرست ----
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // ---- مرجوعی/اصلاحِ یک نوبت، از داخلِ پرونده ----
  const [returning, setReturning] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);

  /**
   * بعد از تسویه، همین‌جا پول گرفته می‌شود.
   *
   * تا حالا «تسویه» فقط نوبت‌ها را نهایی می‌کرد و فروشنده باید صندوق را رها
   * می‌کرد و می‌رفت صفحه‌ی دریافت — دقیقاً همان لحظه‌ای که مشتری با چک در دست
   * ایستاده. مانده از خودِ دفتر خوانده می‌شود، نه از جمعِ همین حساب، چون ممکن
   * است بدهیِ قبلی هم داشته باشد.
   */
  const [settled, setSettled] = useState<
    {
      /** شناسه‌ی حساب — برای چاپِ برگه بعد از تسویه. */
      accountId: string;
      customerId: string;
      customerName: string;
      totalDue: number;
      /** نرخِ فروشِ مدت‌دارِ مشتری — برای فرمِ دریافت. */
      chequeRateBp?: number;
      chequeRateMode?: "FLAT" | "MONTHLY";
    } | null
  >(null);

  /**
   * رسید ثبت شد.
   *
   * بعدش نمی‌پریم به فهرست: برگه‌ای که مشتری باید ببرد همین حالا کامل شده
   * (پرداخت و چک هم رویش می‌آید)، پس دکمه‌ی چاپ باید همین‌جا در دسترس بماند.
   */
  const [receiptDone, setReceiptDone] = useState(false);

  // ---- تعریف حساب ----
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [limit, setLimit] = useState(0);
  const [days, setDays] = useState(0);
  const [pickQ, setPickQ] = useState("");
  const [pickDebounced, setPickDebounced] = useState("");
  const [picked, setPicked] = useState<Customer | null>(null);


  useEffect(() => {
    const t = setTimeout(() => setPickDebounced(pickQ), 250);
    return () => clearTimeout(t);
  }, [pickQ]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // هر بار که باز میشود از فهرست شروع کن.
  useEffect(() => {
    if (!open) return;
    setView("list");
    setSelected(null);
    setQ("");
    setMode("new");
    setNewName("");
    setNewLast("");
    setNewPhone("");
    setLimit(0);
    setDays(0);
    setPickQ("");
    setPickDebounced("");
    setPicked(null);
    setQDebounced("");
    setReturning(null);
    setCorrecting(null);
    setSettled(null);
    setReceiptDone(false);
  }, [open]);

  const list = useQuery({
    queryKey: ["open-accounts"],
    queryFn: listOpenAccounts,
    enabled: open,
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = list.data ?? [];
    if (!needle) return all;
    return all.filter(
      (a) =>
        a.customerName.toLowerCase().includes(needle) ||
        (a.phone ?? "").toLowerCase().includes(needle)
    );
  }, [list.data, q]);

  const totalDue = rows.reduce((s, r) => s + r.total, 0);


  /*
   * جست‌وجو در **همه‌ی** مشتری‌ها، نه فقط آن‌هایی که حساب باز دارند.
   *
   * فهرستِ بالا فقط حساب‌های فعال است؛ ولی فروشنده اسم را می‌زند و انتظار دارد
   * مشتری را پیدا کند، چه حساب داشته باشد چه نه. قبلاً برای مشتریِ بدونِ حساب
   * هیچ نتیجه‌ای نمی‌آمد و باید می‌رفت سراغِ «تعریف حساب باز».
   */
  const otherCustomers = useQuery({
    queryKey: ["open-accounts-search", qDebounced],
    queryFn: () => searchCustomers(qDebounced, 10),
    enabled: open && view === "list" && qDebounced.trim().length > 0,
  });
  /** نتایجِ جست‌وجو منهای کسانی که همین حالا در فهرستِ بالا هستند. */
  const otherOptions = useMemo(() => {
    const already = new Set((list.data ?? []).map((a) => a.customerId));
    return (otherCustomers.data ?? []).filter((c) => !already.has(c.id));
  }, [otherCustomers.data, list.data]);

  // جستوجوی مشتریِ موجود برای «تعریف حساب باز».
  const existingResults = useQuery({
    queryKey: ["open-accounts-pick", pickDebounced],
    queryFn: () => searchCustomers(pickDebounced, 10),
    enabled: open && view === "define" && mode === "existing" && pickDebounced.trim().length > 0,
  });

  // پروندهی کاملِ حسابِ انتخابشده.
  const detail = useQuery({
    queryKey: ["open-account", selected?.id],
    queryFn: () => getOpenAccount(selected!.id),
    enabled: open && view === "file" && !!selected?.id,
  });

  /** نوبت‌های خرید — همه‌شان، بدون فیلترِ تاریخ. */
  const visits = detail.data?.invoices ?? [];

  // ---- تعریف حساب باز: مشتری + اعتبار، بعد خودِ حساب. ----
  const define = useMutation({
    mutationFn: async () => {
      const credit = { creditLimit: limit, creditDays: days };
      // همان نرمالسازیِ مسیر تسویه: ارقام فارسی → انگلیسی، +98 به صفر.
      const phone = faToEn(newPhone).replace(/\D/g, "").replace(/^98/, "0").replace(/^9/, "09");
      let c: Customer;
      if (mode === "existing" && picked) {
        c = await updateCustomer(picked.id, credit);
      } else {
        c = await createCustomer({
          firstName: newName.trim() || newLast.trim() || (phone ? toFa(phone) : ""),
          ...(newName.trim() && newLast.trim() ? { lastName: newLast.trim() } : {}),
          ...(phone ? { phones: [{ phone, isPrimary: true }] } : {}),
          ...credit,
        });
      }
      // خودِ حسابِ باز را بساز (idempotent) تا در فهرست بیاید.
      return ensureOpenAccount(c.id);
    },
    onSuccess: (account) => {
      toast.success(`حساب بازِ «${account.customerName}» آمادهی فروش است`);
      qc.invalidateQueries({ queryKey: ["open-accounts"] });
      // از جزئیاتِ تازه، خلاصه می‌سازیم تا در نمای پرونده بنشیند.
      setSelected(toSummary(account));
      setView("file");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "تعریف حساب باز ناموفق بود"),
  });

  const defineValid =
    mode === "existing"
      ? !!picked
      : Boolean(newName.trim() || newLast.trim() || newPhone.trim());

  // ---- تسویه ----
  const settle = useMutation({
    mutationFn: async () => {
      const account = await settleOpenAccount(selected!.id);
      /*
       * مانده از پرونده‌ی خودِ مشتری خوانده می‌شود، نه از جمعِ این حساب: ممکن است
       * بدهیِ قدیمی‌تری هم داشته باشد و فرمِ دریافت باید کلِ بدهی را ببیند تا
       * «باقی‌مانده» درست حساب شود.
       */
      const customer = await getCustomer(account.customerId).catch(() => null);
      return {
        account,
        totalDue: customer?.summary?.totalDue ?? account.total,
        chequeRateBp: customer?.chequeRateBp,
        chequeRateMode: customer?.chequeRateMode,
      };
    },
    onSuccess: ({ account, totalDue, chequeRateBp, chequeRateMode }) => {
      /*
       * بعد از تسویه، پرونده فقط فاکتورهای OPEN را می‌آورد — یعنی invoiceCountِ
       * پاسخ صفر است. عددِ «چند فاکتور نهایی شد» از خودِ پرونده‌ی قبلی خوانده
       * می‌شود تا توست عددِ واقعی را بگوید.
       */
      const settledCount = detail.data?.invoiceCount ?? 0;
      toast.success(
        `حساب بازِ «${account.customerName}» تسویه شد — ${toFa(settledCount)} فاکتور نهایی شد`
      );
      qc.invalidateQueries({ queryKey: ["open-accounts"] });
      qc.invalidateQueries({ queryKey: ["customer", account.customerId] });

      // بدهی صفر شده (مثلاً همه‌اش مرجوعی خورده) → دیگر فرمِ دریافت لازم نیست.
      if (totalDue <= 0) {
        setView("list");
        setSelected(null);
        return;
      }

      setReceiptDone(false);
      setSettled({
        accountId: account.id,
        customerId: account.customerId,
        customerName: account.customerName,
        totalDue,
        chequeRateBp,
        chequeRateMode,
      });
      setView("receipt");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "تسویهی حساب ناموفق بود"),
  });

  /**
   * مشتری از نتایجِ جست‌وجو انتخاب شد: حسابِ بازش را بردار، و اگر ندارد بساز.
   * `ensureOpenAccount` خودش idempotent است، پس همین یک مسیر هر دو حالت را
   * می‌پوشاند و فروشنده لازم نیست بداند مشتری قبلاً حساب داشته یا نه.
   */
  const openForCustomer = useMutation({
    mutationFn: (customerId: string) => ensureOpenAccount(customerId),
    onSuccess: (account) => {
      qc.invalidateQueries({ queryKey: ["open-accounts"] });
      setSelected(toSummary(account));
      setView("file");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "باز کردن حساب ناموفق بود"),
  });

  const openFile = (a: OpenAccountSummary) => {
    setSelected(a);
    /*
     * پیش‌فرض «همه‌ی آنچه برده»، نه «امروز».
     *
     * کلِ دلیلِ وجودِ حساب باز این است که خرید چند روز طول می‌کشد؛ مشتری صبح
     * می‌برد، عصر می‌برد، فردا می‌آید تسویه کند. با پیش‌فرضِ «امروز» پرونده در
     * روزِ تسویه می‌نوشت «در این بازه چیزی نبرده» — دقیقاً وقتی که فروشنده باید
     * کلِ حساب را ببیند. بازه‌ها سرِ جایشان هستند برای وقتی که خودش بخواهد.
     */
    setView("file");
  };

  return (
    <>
    {/*
      وقتی مرجوعی/اصلاح باز است این پنجره جمع می‌شود تا پنجره‌روی‌پنجره نشود؛ بعد
      از بستنِ آن دوباره برمی‌گردد. همان الگوی «فاکتورهای امروز».
    */}
    <Dialog
      open={open && !returning && !correcting}
      onOpenChange={(v) => { if (!v && !returning && !correcting) onClose(); }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-base">حسابهای باز</DialogTitle>
          {view !== "list" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setView("list"); setSelected(null); }}
            >
              <ArrowRight className="size-4" /> بازگشت به فهرست
            </Button>
          )}
        </DialogHeader>

        {/* ---------- فهرست حسابها ---------- */}
        {view === "list" && (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="نام یا شمارهی هر مشتری…"
                  className="h-10 ps-3 pe-9"
                />
              </div>
              <Button size="sm" className="h-10 shrink-0" onClick={() => setView("define")}>
                <Plus className="size-4" /> تعریف حساب باز
              </Button>
            </div>

            <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {toFa(rows.length)} مشتری با حساب باز
              </span>
              <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {money(totalDue)} ریال
              </span>
            </div>

            <div className="flex max-h-[52vh] flex-col gap-1 overflow-y-auto">
              {rows.length === 0 && !list.isFetching && !qDebounced.trim() && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  هیچ حساب بازی نیست — نامِ مشتری را بنویسید تا حساب باز کنید
                </p>
              )}

              {rows.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openFile(a)}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-right
                             transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.customerName}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      {a.phone ? toFa(a.phone) : "بدون شماره"}
                    </span>
                  </span>

                  <span className="shrink-0 text-end">
                    <span className="block text-base font-bold tabular-nums">
                      {money(a.total)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {toFa(a.invoiceCount)} نوبت
                      {a.firstVisit && a.lastVisit
                        ? ` · ${faDate(a.firstVisit)} تا ${faDate(a.lastVisit)}`
                        : ""}
                    </span>
                  </span>

                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}

              {/*
                مشتریانی که حساب باز ندارند ولی با همین عبارت پیدا می‌شوند.
                کلیک روی هرکدام حساب را باز (یا حسابِ موجود را ادامه) می‌دهد —
                بدونِ رفتن به فرمِ «تعریف حساب باز».
              */}
              {otherOptions.length > 0 && (
                <>
                  <p className="mt-2 px-1 text-xs text-muted-foreground">
                    مشتریانِ دیگر — بدون حساب باز
                  </p>
                  {otherOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={openForCustomer.isPending}
                      onClick={() => openForCustomer.mutate(c.id)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-right
                                 transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.fullName}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {c.phones?.[0]?.phone ? toFa(c.phones[0].phone) : "بدون شماره"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-primary">
                        <Plus className="me-1 inline size-3.5" />
                        باز کردن حساب
                      </span>
                    </button>
                  ))}
                </>
              )}

              {rows.length === 0 &&
                otherOptions.length === 0 &&
                qDebounced.trim().length > 0 &&
                !otherCustomers.isFetching && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    مشتریای با این مشخصات پیدا نشد
                  </p>
                )}
            </div>
          </>
        )}

        {/* ---------- تعریف حساب باز ---------- */}
        {view === "define" && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              {(["new", "existing"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`h-9 flex-1 rounded-md text-sm font-medium transition-colors ${
                    mode === m ? "bg-primary text-primary-foreground" : "hover:bg-background"
                  }`}
                >
                  {m === "new" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <UserPlus className="size-4" /> مشتری جدید
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4" /> مشتری موجود
                    </span>
                  )}
                </button>
              ))}
            </div>

            {mode === "new" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">نام</label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="الزامی" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">نام خانوادگی</label>
                    <Input value={newLast} onChange={(e) => setNewLast(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    شماره تماس <span className="text-muted-foreground">(اختیاری)</span>
                  </label>
                  <Input
                    dir="ltr"
                    className="text-right"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="۰۹۱۲…"
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={pickQ}
                    onChange={(e) => { setPickQ(e.target.value); setPicked(null); }}
                    placeholder="نام یا شمارهی مشتری…"
                    className="h-10 ps-3 pe-9"
                  />
                </div>
                <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
                  {(existingResults.data ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setPicked(c);
                        setLimit(c.creditLimit ?? 0);
                        setDays(c.creditDays ?? 0);
                      }}
                      className={`flex items-center justify-between rounded-lg border p-2.5 text-right transition-colors ${
                        picked?.id === c.id ? "border-primary bg-primary/5" : "hover:border-primary"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.fullName}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {c.phones?.[0]?.phone ? toFa(c.phones[0].phone) : "بدون شماره"}
                        </span>
                      </span>
                      {picked?.id === c.id && <Check className="size-4 text-primary" />}
                    </button>
                  ))}
                  {pickDebounced.trim() && !existingResults.isFetching && !existingResults.data?.length && (
                    <p className="py-3 text-center text-sm text-muted-foreground">مشتریای پیدا نشد</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  سقف اعتبار <span className="text-muted-foreground">(ریال، ۰ = بدون سقف)</span>
                </label>
                <MoneyInput className="h-10 text-right tabular-nums" value={limit} onChange={setLimit} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">مهلت پرداخت</label>
                <div className="flex flex-wrap gap-1">
                  {CREDIT_TERMS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays(d)}
                      className={`h-9 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                        days === d
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary hover:text-primary"
                      }`}
                    >
                      {d === 0 ? "همان روز" : `${toFa(d)} روز`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              className="h-11"
              disabled={!defineValid || define.isPending}
              onClick={() => define.mutate()}
            >
              {define.isPending ? "در حال ثبت…" : "ثبت و باز کردن حساب"}
            </Button>
          </div>
        )}

        {/* ---------- پروندهی حساب ---------- */}
        {view === "file" && selected && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div>
                <p className="font-semibold">{selected.customerName}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {selected.phone ? toFa(selected.phone) : "بدون شماره"}
                  {selected.number ? ` · حساب باز #${toFa(selected.number)}` : ""}
                </p>
              </div>
              <div className="text-end">
                <p className="text-base font-bold tabular-nums">
                  {money(detail.data?.total ?? selected.total)} ریال
                </p>
                {detail.data && (
                  <p className="text-xs text-muted-foreground">
                    {toFa(detail.data.invoiceCount)} نوبت خرید
                  </p>
                )}
              </div>
            </div>

            {/*
              خریدها — نوبت به نوبت.

              فیلترِ تاریخ برداشته شد: پیش‌فرضش «امروز» بود و روزِ تسویه (که خرید
              مالِ دیروز است) پرونده را خالی نشان می‌داد. تاریخِ هر نوبت روی
              سرستونِ خودش هست، پس فیلتر چیزی اضافه نمی‌کرد جز یک راهِ خالی‌شدن.

              ارتفاع بر حسبِ صفحه است نه عددِ ثابت، تا روی نمایشگرِ بزرگ‌تر
              نوبت‌های بیشتری بدونِ اسکرول دیده شود.
            */}
            <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto">
              {detail.isLoading && (
                <p className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری…</p>
              )}

              {!detail.isLoading && visits.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  هنوز چیزی نبرده
                </p>
              )}

              {!detail.isLoading &&
                visits.map((inv) => (
                  <div key={inv.id} className="overflow-hidden rounded-lg border">
                    <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-1.5 text-xs">
                      <span className="font-medium">
                        فاکتور {toFa(inv.number)} · {faDate(inv.createdAt)}
                      </span>

                      {/*
                        مرجوعی و اصلاح روی خودِ نوبت، نه روی سبد.
                        هر دو دیالوگ فاکتوری‌اند (همه‌ی ردیف‌های همان نوبت را نشان
                        می‌دهند)، پس دکمه هم سرِ همان نوبت می‌نشیند تا دامنه‌اش
                        با چیزی که باز می‌شود یکی باشد.
                      */}
                      <span className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setReturning(inv.id)}
                        >
                          <Undo2 className="size-3.5" /> مرجوعی
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setCorrecting(inv.id)}
                        >
                          <PencilLine className="size-3.5" /> اصلاح
                        </Button>
                        <span className="font-bold tabular-nums">
                          {money(inv.netTotal)} ریال
                        </span>
                        {inv.netTotal !== inv.total && (
                          <span className="text-[11px] text-muted-foreground line-through">
                            {money(inv.total)}
                          </span>
                        )}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {inv.lines.map((l) => {
                          // قلمی که کاملاً برگشته در پرونده می‌ماند (تاریخچه
                          // append-only است) ولی کم‌رنگ می‌شود تا با اقلامِ زنده
                          // اشتباه نشود.
                          const gone = l.effectiveQuantity <= 0;
                          return (
                            <tr
                              key={l.id}
                              className={`border-t first:border-t-0 ${gone ? "opacity-50" : ""}`}
                            >
                              <td className="px-3 py-1.5">
                                <span
                                  className={`block font-medium ${gone ? "line-through" : ""}`}
                                >
                                  {l.productName}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {faDate(l.createdAt)}
                                  {l.returnedQuantity > 0 && (
                                    <span className="ms-2 text-amber-600 dark:text-amber-400">
                                      {toFa(l.returnedQuantity)} مرجوع شد
                                    </span>
                                  )}
                                  {l.correctedQuantity !== 0 && (
                                    <span className="ms-2 text-info">
                                      اصلاح {l.correctedQuantity > 0 ? "+" : "−"}
                                      {toFa(Math.abs(l.correctedQuantity))}
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                                {toFa(l.effectiveQuantity)} {l.unit ?? "عدد"}
                              </td>
                              <td className="px-3 py-1.5 text-end tabular-nums">
                                {money(l.effectiveQuantity * l.unitPrice - l.discount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>

            {/* ادامه + چاپ + تسویه */}
            <div className="flex items-center gap-2">
              <Button
                className="h-11 flex-1 gap-2"
                onClick={() => { onContinue(selected); onClose(); }}
              >
                <Plus className="size-4" /> ادامهی فاکتور — فروش به همین حساب
              </Button>
              {/*
                صورت‌حساب کلی: همه‌ی نوبت‌ها روی یک برگه. پیش از تسویه هم کار
                می‌کند — مشتری اغلب می‌خواهد قبل از پرداخت ببیند چه برده.
              */}
              <Button
                variant="outline"
                className="h-11 gap-2"
                onClick={() =>
                  window.open(`/admin/print/open-account/${selected.id}`, "_blank")
                }
              >
                <Printer className="size-4" /> چاپ
              </Button>
              <Button
                variant="destructive"
                className="h-11 gap-2"
                disabled={settle.isPending || (detail.data?.invoiceCount ?? 0) === 0}
                onClick={() => {
                  const count = detail.data?.invoiceCount ?? 0;
                  if (!window.confirm(`تسویهی حساب بازِ «${selected.customerName}»؟ ${toFa(count)} نوبت خرید نهایی میشود.`)) return;
                  settle.mutate();
                }}
              >
                <CheckCheck className="size-4" />
                {settle.isPending ? "در حال تسویه…" : "تسویه و دریافت"}
              </Button>
            </div>
          </div>
        )}

        {/* ---------- دریافتِ پول، بلافاصله بعد از تسویه ---------- */}
        {view === "receipt" && settled && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
              حساب بازِ <span className="font-semibold">{settled.customerName}</span> تسویه
              شد. حالا می‌توانید پول را بگیرید — نقد، کارت و چک با هم.
            </div>

            <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">کل بدهیِ مشتری</span>
              <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {money(settled.totalDue)} ریال
              </span>
            </div>

            {!receiptDone && (
              <>
                {/*
                  همان فرمِ «دریافت» صفحه‌ی مشتری — نه یک فرمِ موازی. هر مبلغی که
                  کم‌تر از بدهی باشد، باقی‌اش خودبه‌خود نسیه می‌ماند و در دفتر
                  می‌نشیند.
                */}
                <ReceiptForm
                  customerId={settled.customerId}
                  totalDue={settled.totalDue}
                  chequeRateBp={settled.chequeRateBp}
                  chequeRateMode={settled.chequeRateMode}
                  onDone={() => {
                    qc.invalidateQueries({ queryKey: ["open-accounts"] });
                    qc.invalidateQueries({ queryKey: ["customer", settled.customerId] });
                    setReceiptDone(true);
                  }}
                />

                <Button
                  variant="ghost"
                  className="h-10"
                  onClick={() => {
                    toast.info("بدهی در حسابِ مشتری ثبت است — هر وقت آمد از «دریافت» بگیرید");
                    setReceiptDone(true);
                  }}
                >
                  فعلاً پول نمی‌دهد — بماند روی حساب
                </Button>
              </>
            )}

            {receiptDone && (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                کار این حساب تمام است. برگه را چاپ کنید و بدهید دستِ مشتری —
                پرداخت و چک هم رویش می‌آید.
              </p>
            )}

            {/*
              برگه‌ی نهایی. بعد از تسویه پرونده خالی می‌شود، ولی اندپوینتِ برگه
              فاکتورهای تسویه‌شده را هم می‌آورد — پس این دکمه بعد از تسویه و حتی
              بعد از ثبت رسید هم کار می‌کند.
            */}
            <div className="flex items-center gap-2">
              <Button
                variant={receiptDone ? "default" : "outline"}
                className="h-11 flex-1 gap-2"
                onClick={() =>
                  window.open(`/admin/print/open-account/${settled.accountId}`, "_blank")
                }
              >
                <Printer className="size-4" /> چاپ صورت‌حساب کلی
              </Button>

              {receiptDone && (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setSettled(null);
                    setReceiptDone(false);
                    setSelected(null);
                    setView("list");
                  }}
                >
                  بستن
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/*
      مرجوعی و اصلاحِ یک نوبت، از داخلِ همین پرونده. بعد از ثبت، پرونده و فهرست
      دوباره خوانده می‌شوند تا جمعِ خالص همان لحظه درست شود.
    */}
    <ReturnDialog
      invoiceId={returning}
      onClose={() => setReturning(null)}
      onDone={() => {
        qc.invalidateQueries({ queryKey: ["open-accounts"] });
        if (selected?.id) {
          qc.invalidateQueries({ queryKey: ["open-account", selected.id] });
        }
      }}
    />

    <CorrectionDialog
      invoiceId={correcting}
      onClose={() => setCorrecting(null)}
      onDone={() => {
        qc.invalidateQueries({ queryKey: ["open-accounts"] });
        if (selected?.id) {
          qc.invalidateQueries({ queryKey: ["open-account", selected.id] });
        }
      }}
    />
    </>
  );
}
