"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  createCustomer,
  getActiveCustomerCategories,
  getCustomer,
  getCustomerBalances,
  getInvoices,
  reversePayment,
  searchCustomers,
} from "@/lib/api";
import { money, toFa } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import { CustomerLedgerTable, toLedgerRows } from "@/components/customer-ledger";
import { BalanceBadge, balanceTextClass } from "@/components/finance-badges";
import { PaymentReversalDialog } from "@/components/payment-reversal-dialog";
import type { Customer, CustomerBalanceRow } from "@/lib/types";

/**
 * مشتری و ریزگردش حسابش — یک جدول، نه بیشتر.
 *
 * عمداً هیچ دکمه‌ای روی ردیف‌ها نیست و هیچ ستونی قاب و رنگِ اضافه ندارد: این
 * صفحه فقط برای خواندن و انتخاب است. هر کاری که می‌شود کرد، یک کلید دارد و
 * در نوار پایین نوشته شده.
 *
 * دو حالت، یک جدول:
 *   ۱. تایپ می‌کنی → مشتری‌ها را نشان می‌دهد.
 *   ۲. Enter می‌زنی → همان جدول می‌شود ریزگردشِ همان مشتری.
 *
 * دو ستونیِ قبلی حذف شد؛ نصفِ عرضِ صفحه برای فهرستی که فقط نام و تلفن دارد
 * حیف بود، و چشم باید بین دو ستونِ فعال و غیرفعال تصمیم می‌گرفت.
 */
export function CustomerInvoicesPanel({
  open,
  mode,
  initialCustomer,
  onPickCustomer,
  onOpenInvoice,
  onReturnInvoice,
  onAdjustInvoice,
  onCopyInvoice,
  onFixPayment,
  onClose,
}: {
  open: boolean;
  /**
   * پنل برای چه باز شده.
   *
   * «pick» کارِ پرتکرار است — انتخابِ مشتری برای همین سبد؛ Enter همان‌جا
   * تمامش می‌کند. «ledger» وقتی است که روی نامِ مشتری کلیک شده و منظور
   * دیدنِ فاکتورهایش بوده. یکی‌کردنشان باعث شده بود انتخابِ ساده‌ی مشتری از
   * دو کلید به چهار کلید برسد.
   */
  mode: "pick" | "ledger";
  initialCustomer: Customer | null;
  onPickCustomer: (c: Customer) => void;
  /** «این فاکتور را بیاور بالا» — بارگذاری در همین صفحه‌ی فروش برای ویرایش. */
  onOpenInvoice: (invoiceId: string, customer: Customer) => void;
  /** همان فاکتور، ولی به‌عنوان سندِ برگشت از فروش. */
  onReturnInvoice: (invoiceId: string, customer: Customer) => void;
  /**
   * همان فاکتور در حالتِ «عملیات یکپارچه»: مرجوعی + قلمِ تازه + تصحیح قیمت،
   * همه در یک ثبتِ اتمیک. Ctrl+Enter در این پنل مالِ «این مشتری روی سبد» است،
   * پس این ورودی روی Shift+Enter نشسته تا تداخلی نداشته باشد.
   */
  onAdjustInvoice: (invoiceId: string, customer: Customer) => void;
  /**
   * کپیِ اقلامِ فاکتور در یک سبدِ فروشِ تازه — «همان‌ها را دوباره می‌برد».
   * فاکتورِ باطل‌شده اینجا هم رد می‌شود (صفحه هم راهنما دارد هم سرور).
   */
  onCopyInvoice: (invoiceId: string, customer: Customer) => void;
  /**
   * «نحوهٔ پرداختش اشتباه ثبت شده» — قلم‌ها دست نمی‌خورد، فقط تقسیمِ پرداخت
   * از نو نوشته می‌شود (کارتِ ۱۰۰م که باید ۳۰ نقد + ۷۰ نسیه می‌بود).
   * روی P نشسته چون C، Enter و Shift/Alt+Enter گرفته‌اند.
   */
  onFixPayment: (invoiceId: string, customer: Customer) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<Customer | null>(null);
  const [row, setRow] = useState(0);
  const [creating, setCreating] = useState(false);

  /**
   * «حساب‌بازها» — فهرست از خودِ دفتر: بدهکارها و طلبکارها با هم.
   * انتخابِ کاربر بین دو باز می‌ماند تا هر بار لازم نباشد دوباره کلیک کند.
   */
  const [onlyBalances, setOnlyBalances] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  /*
   * برگشتِ پرداخت — کارتخوانِ برگشت‌زده و بانکِ ردکننده. از ردیفِ هر فاکتورِ
   * پرداخت‌شده در همین پنل در دسترس است تا فروشنده بدون رفتن به پنل مدیریت،
   * همان‌جا بدهی را برقرار کند.
   */
  const [reversing, setReversing] = useState<
    { id: string; number: number; paid: number; customerName: string; idem: string } | null
  >(null);
  const queryClient = useQueryClient();
  const reverse = useMutation({
    mutationFn: (v: { id: string; amount: number; method: "CASH" | "CARD" | "CHEQUE"; reason?: string; idempotencyKey?: string }) =>
      reversePayment(v.id, v),
    onSuccess: () => {
      toast.success("برگشت پرداخت ثبت شد — مانده به بدهی مشتری برمی‌گردد");
      setReversing(null);
      // مانده‌ی فاکتورها و دفتر همان لحظه؛ اعلانِ realtime هم هست ولی پنلِ
      // همین مشتری بی‌درنگ تازه شود تا اعداد نبیندِ کهنه نگیرد.
      void queryClient.invalidateQueries({ queryKey: ["pos-customer-invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["customer"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-customer-balances"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "ثبت برگشت پرداخت ناموفق بود"),
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  /*
   * باز شدن → فرم از نو، و مشتریِ اولیه‌ی «حالتِ دفتر» در جای خودش. ریست‌ها با
   * تطبیقِ state در رندر (به ازایِ open/mode/initialCustomer) به‌جای effect. فوکوسِ
   * جست‌وجو هم با همان شروط، ولی در یک effectِ جدا که setState ندارد، اجرا
   * می‌شود تا قانونِ set-state-in-effect نقض نشود.
   */
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevMode, setPrevMode] = useState(mode);
  const [prevInitial, setPrevInitial] = useState(initialCustomer);
  if (open !== prevOpen || mode !== prevMode || initialCustomer !== prevInitial) {
    setPrevOpen(open);
    setPrevMode(mode);
    setPrevInitial(initialCustomer);
    if (open) {
      setQ("");
      setDebounced("");
      setCreating(false);
      setRow(0);
      setPicked(mode === "ledger" ? initialCustomer : null);
    }
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, mode, initialCustomer]);

  const results = useQuery({
    queryKey: ["pos-customer-lookup", debounced],
    queryFn: () => searchCustomers(debounced, 50),
    enabled: open && !picked && !creating && !onlyBalances,
  });

  /** بدهکارها و طلبکارها از خودِ دفتر — همان منبعِ دکمه‌ی F3. */
  const balances = useQuery({
    queryKey: ["pos-customer-balances", debounced],
    queryFn: () => getCustomerBalances(debounced),
    enabled: open && !picked && !creating && onlyBalances,
  });
  const balanceRows = balances.data ?? [];

  /** ردیفِ مانده‌دار فقط id دارد — پرونده‌ی کامل مشتری را می‌گیریم و بعد ادامه. */
  const resolveCustomer = (b: CustomerBalanceRow, cb: (c: Customer) => void) => {
    getCustomer(b.id)
      .then(cb)
      .catch(() => toast.error("بارگذاری مشتری ناموفق بود"));
  };

  const invoices = useQuery({
    queryKey: ["pos-customer-invoices", picked?.id],
    queryFn: () => getInvoices({ customerId: picked!.id, pageSize: 100, includeLines: true }),
    enabled: open && !!picked?.id,
    staleTime: 10_000,
  });

  const customers = results.data ?? [];

  /**
   * ردیف‌های ریزگردش با مانده‌ی تجمعی.
   *
   * قدیمی‌ترین اول، چون مانده فقط وقتی معنی دارد که از بالا جمع شود — همان
   * کاری که هر دفتر حسابی می‌کند. سرور جدیدترین را اول می‌دهد.
   */
  const ledger = useMemo(() => toLedgerRows(invoices.data?.data ?? []), [invoices.data]);

  const count = picked
    ? ledger.length
    : onlyBalances
      ? balanceRows.length
      : customers.length;

  /* با تغییرِ عبارت یا مشتریِ انتخابی، ردیف به اول برمی‌گردد — تطبیقِ state در رندر. */
  const [prevDebounced, setPrevDebounced] = useState(debounced);
  const [prevPickedId, setPrevPickedId] = useState(picked?.id);
  if (debounced !== prevDebounced || picked?.id !== prevPickedId) {
    setPrevDebounced(debounced);
    setPrevPickedId(picked?.id);
    setRow(0);
  }

  /** ردیفِ فعال همیشه باید دیده شود — جدول بلند است و کیبورد اسکرول نمی‌کند. */
  useEffect(() => {
    document.querySelector('[data-active-row="true"]')?.scrollIntoView({ block: "nearest" });
  }, [row, count]);

  if (!open) return null;

  const openLedger = (c: Customer | undefined) => {
    if (!c) return;
    setPicked(c);
    setQ("");
    setDebounced("");
  };

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-background"
      onKeyDown={(e) => {
        if (creating) return;

        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          // Esc اول از ریزگردش برمی‌گردد به فهرست، بعد پنل را می‌بندد.
          if (picked && mode === "pick") setPicked(null);
          else onClose();
          return;
        }

        if (e.key === "Insert") {
          e.preventDefault();
          setCreating(true);
          return;
        }

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 1, Math.max(count - 1, 0)));
            return;
          case "ArrowUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 1, 0));
            return;
          case "PageDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 12, Math.max(count - 1, 0)));
            return;
          case "PageUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 12, 0));
            return;
        }

        /*
         * ← در چیدمان راست‌به‌چپ یعنی «برو جلوتر» — از مشتری به ریزگردشش.
         * پرتکرارترین کار (انتخاب مشتری) روی Enter می‌ماند.
         */
        if (e.key === "ArrowLeft" && !picked) {
          e.preventDefault();
          if (onlyBalances) {
            const b = balanceRows[row];
            if (b) resolveCustomer(b, openLedger);
          } else openLedger(customers[row]);
          return;
        }

        /*
         * C روی ریزگردش = «کپیِ اقلامِ همین فاکتور در سبدِ تازه».
         *
         * پرتکرارترین خریدِ مشتریِ ثابت همان اقلامِ دفعه‌ی قبل است؛ تا حالا
         * باید فاکتور را ویرایش باز می‌کرد و از سندِ قفل می‌گریخت. گاردِ
         * پیکرشده‌ی حروفِ ترکیبی لازم است تا Ctrl+C (کپیِ متن) و ترکیب‌های
         * دیگر دست‌نخورده بمانند، و شرطِ `picked` تایپِ «c» در کادرِ جست‌وجو
         * را هرگز مزاحم نمی‌کند.
         */
        /*
         * حرف‌ها را هم با `key` و هم با `code` می‌سنجیم: روی ویندوزِ
         * فارسی‌زبان چیدمانِ کیبورد اغلب فارسی است و آن‌وقت کلیدِ فیزیکیِ C
         * حرفِ «ش» می‌دهد، نه «c». کلیدهای تک‌حرفی باید مثل کلیدهای F کار کنند.
         */
        if (
          picked &&
          (e.key.toLowerCase() === "c" || e.code === "KeyC") &&
          !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
        ) {
          e.preventDefault();
          const inv = ledger[row]?.inv;
          if (inv && inv.status !== "CANCELLED") onCopyInvoice(inv.id, picked);
          return;
        }

        /*
         * P روی ریزگردش = «اصلاحِ نحوهٔ پرداخت».
         *
         * همان گاردِ C: حرفِ خالی و بدونِ ترکیب، و فقط وقتی مشتری انتخاب
         * شده — تا تایپِ «p» در کادرِ جست‌وجو مزاحم نشود.
         */
        if (
          picked &&
          (e.key.toLowerCase() === "p" || e.code === "KeyP") &&
          !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
        ) {
          e.preventDefault();
          const inv = ledger[row]?.inv;
          if (inv && inv.status !== "CANCELLED") onFixPayment(inv.id, picked);
          return;
        }

        if (e.key !== "Enter") return;
        e.preventDefault();

        if (!picked) {
          if (onlyBalances) {
            const b = balanceRows[row];
            if (b) {
              // Ctrl+Enter = «نمی‌خواهم انتخابش کنم، فقط حسابش را ببینم».
              resolveCustomer(b, e.ctrlKey || e.metaKey ? openLedger : onPickCustomer);
            }
            return;
          }
          const c = customers[row];
          // Ctrl+Enter = «نمی‌خواهم انتخابش کنم، فقط حسابش را ببینم».
          if (c) (e.ctrlKey || e.metaKey ? openLedger : onPickCustomer)(c);
          return;
        }

        // Shift+Enter روی ریزگردش = عملیات یکپارچه روی همان فاکتور.
        if (e.shiftKey) {
          const inv = ledger[row]?.inv;
          if (inv) onAdjustInvoice(inv.id, picked);
          return;
        }

        // Ctrl+Enter روی ریزگردش = «همین مشتری را بگذار روی سبد» و برو.
        if (e.ctrlKey || e.metaKey) {
          onPickCustomer(picked);
          return;
        }

        const inv = ledger[row]?.inv;
        if (!inv) return;
        if (e.altKey) onReturnInvoice(inv.id, picked);
        else onOpenInvoice(inv.id, picked);
      }}
    >
      {creating ? (
        <NewCustomerForm
          onCancel={() => {
            setCreating(false);
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
          onCreated={onPickCustomer}
        />
      ) : (
        <>
          {/* یک سطر سربرگ — یا کادر جست‌وجو، یا مشخصات حسابِ باز شده. */}
          <div className="flex shrink-0 items-center gap-4 border-b px-3 py-2">
            {picked ? (
              <>
                <span className="text-base font-bold">حساب: {picked.fullName}</span>
                <span dir="ltr" className="text-sm text-muted-foreground">
                  {picked.phones?.find((p) => p.isPrimary)?.phone ??
                    picked.phones?.[0]?.phone ??
                    "—"}
                </span>
                <span className="ms-auto text-sm">
                  مانده:{" "}
                  <b className={`tabular-nums ${balanceTextClass(ledger.at(-1)?.balance ?? 0)}`}>
                    {money(ledger.at(-1)?.balance ?? 0)}
                  </b>
                </span>
              </>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="نام، فامیل یا شماره‌ی مشتری…"
                  className="h-9 flex-1 text-base"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOnlyBalances(false)}
                    className={`h-9 rounded-md border px-3 text-xs font-medium transition-colors ${
                      !onlyBalances
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:border-primary hover:text-primary"
                    }`}
                  >
                    همه
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyBalances(true)}
                    className={`h-9 rounded-md border px-3 text-xs font-medium transition-colors ${
                      onlyBalances
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:border-primary hover:text-primary"
                    }`}
                  >
                    حساب‌بازها
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {picked ? (
              <CustomerLedgerTable
                rows={ledger}
                active={row}
                onActivate={setRow}
                onOpen={(i) => {
                  const inv = ledger[i]?.inv;
                  if (inv) onOpenInvoice(inv.id, picked);
                }}
                onReversePayment={(inv, paid) =>
                  setReversing({
                    id: inv.id,
                    number: inv.number,
                    paid,
                    customerName: picked.fullName,
                    // کلیدِ یکتا برای هر بارِ بازشدن — دوبارِ Enter با retryِ شبکه فاکتورِ تکراری نمی‌سازد.
                    idem: uuid(),
                  })
                }
              />
            ) : onlyBalances ? (
              <BalanceTable
                rows={balanceRows}
                active={row}
                loading={balances.isFetching}
                onActivate={setRow}
                onPick={(i) => {
                  const b = balanceRows[i];
                  if (b) resolveCustomer(b, onPickCustomer);
                }}
                onOpenLedger={(i) => {
                  const b = balanceRows[i];
                  if (b) resolveCustomer(b, openLedger);
                }}
              />
            ) : (
              <CustomerTable
                rows={customers}
                active={row}
                loading={results.isFetching}
                onActivate={setRow}
                onOpen={(i) => {
                  const c = customers[i];
                  if (c) onPickCustomer(c);
                }}
                onOpenLedger={(i) => openLedger(customers[i])}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-x-5 overflow-x-auto whitespace-nowrap border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            {(picked
              ? [
                  ["↑↓", "حرکت"],
                  ["Enter", "باز کردن فاکتور برای ویرایش (بدون حافظه)"],
                  ["Alt+Enter", "برگشت از فروش"],
                  ["Shift+Enter", "ویرایش با حافظه"],
                  ["C", "کپی اقلام در سبدِ تازه"],
                  ["P", "اصلاح نحوهٔ پرداخت"],
                  ["Ctrl+Enter", "این مشتری روی سبد"],
                  ["Esc", "برگشت"],
                ]
              : [
                  ["↑↓", "حرکت"],
                  ["Enter", "این مشتری روی سبد"],
                  ["←", "ریزگردش حسابش"],
                  ["Insert", "مشتری جدید"],
                  ["Esc", "بستن"],
                ]
            ).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5">
                <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]">
                  {k}
                </kbd>
                {label}
              </span>
            ))}
          </div>
        </>
      )}

      {/* برگشتِ پرداخت — روی پنل می‌نشیند تا جدول پشتش حفظ شود. */}
      {reversing && (
        <PaymentReversalDialog
          open
          invoiceId={reversing.id}
          invoiceNumber={reversing.number}
          paidAmount={reversing.paid}
          customerName={reversing.customerName}
          pending={reverse.isPending}
          onConfirm={(id, dto) =>
            reverse.mutate({ ...dto, id: id, idempotencyKey: reversing.idem })
          }
          onClose={() => setReversing(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

function CustomerTable({
  rows,
  active,
  loading,
  onActivate,
  onOpen,
  onOpenLedger,
}: {
  rows: Customer[];
  active: number;
  loading: boolean;
  onActivate: (i: number) => void;
  /** انتخابِ مشتری برای همین سبد. */
  onOpen: (i: number) => void;
  /** فقط دیدنِ ریزگردشِ حساب. */
  onOpenLedger: (i: number) => void;
}) {
  if (!rows.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {loading ? "…" : "مشتری‌ای پیدا نشد"}
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/70 backdrop-blur">
        <tr>
          <th className={`${TH} w-12`}>ردیف</th>
          <th className={TH}>نام</th>
          <th className={`${TH} w-40`}>شماره</th>
          <th className={`${TH} w-24`} />
        </tr>
      </thead>
      <tbody>
        {rows.map((c, i) => (
          <tr
            key={c.id}
            data-active-row={i === active}
            className="cursor-pointer border-b"
            onMouseEnter={() => onActivate(i)}
            onClick={() => onOpen(i)}
          >
            <td className={`${TD} tabular-nums text-muted-foreground`}>{toFa(i + 1)}</td>
            <td className={`${TD} font-semibold`}>{c.fullName}</td>
            <td dir="ltr" className={`${TD} text-start text-muted-foreground`}>
              {c.phones?.find((p) => p.isPrimary)?.phone ?? c.phones?.[0]?.phone ?? "—"}
            </td>
            <td className={TD}>
              <span
                role="button"
                tabIndex={-1}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onOpenLedger(i);
                }}
              >
                حساب
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * فهرستِ حساب‌بازها — بدهکار و طلبکار با هم، مانده از خودِ دفتر.
 * بدهکار کهربایی، طلبکار سبز؛ معوقِ بدهکار هم روی همان ردیف دیده می‌شود.
 */
function BalanceTable({
  rows,
  active,
  loading,
  onActivate,
  onPick,
  onOpenLedger,
}: {
  rows: CustomerBalanceRow[];
  active: number;
  loading: boolean;
  onActivate: (i: number) => void;
  onPick: (i: number) => void;
  onOpenLedger: (i: number) => void;
}) {
  if (!rows.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {loading ? "…" : "کسی با مانده‌ی باز نیست — همه‌ی حساب‌ها تسویه‌اند"}
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/70 backdrop-blur">
        <tr>
          <th className={`${TH} w-12`}>ردیف</th>
          <th className={TH}>نام</th>
          <th className={`${TH} w-40`}>شماره</th>
          <th className={`${TH} w-20`}>فاکتور</th>
          <th className={`${TH} w-24`}>وضعیت</th>
          <th className={`${TH} w-40`}>مانده</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b, i) => (
          <tr
            key={b.id}
            data-active-row={i === active}
            className="cursor-pointer border-b"
            onMouseEnter={() => onActivate(i)}
            onClick={() => onPick(i)}
          >
            <td className={`${TD} tabular-nums text-muted-foreground`}>{toFa(i + 1)}</td>
            <td className={`${TD} font-semibold`}>{b.fullName}</td>
            <td dir="ltr" className={`${TD} text-start text-muted-foreground`}>
              {b.phone ?? "—"}
            </td>
            <td className={`${TD} tabular-nums text-muted-foreground`}>
              {b.balance > 0 ? toFa(b.invoiceCount) : "—"}
            </td>
            <td className={TD}>
              <BalanceBadge amount={b.balance} overdue={b.overdue > 0} />
            </td>
            <td className={`${TD} text-end font-bold tabular-nums ${balanceTextClass(b.balance)}`}>
              {money(b.balance)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ساختِ مشتری بدون ترکِ پنل — فقط چهار خانه، چون بقیه‌اش در پرونده پر می‌شود. */
function NewCustomerForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (c: Customer) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const categories = useQuery({
    queryKey: ["customer-categories", "active"],
    queryFn: getActiveCustomerCategories,
  });

  const create = useMutation({
    mutationFn: () =>
      createCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phones: phone.trim() ? [{ phone: phone.trim(), isPrimary: true }] : undefined,
        categoryId: categoryId || undefined,
      }),
    onSuccess: (c) => {
      toast.success("مشتری ثبت شد");
      onCreated(c);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "ثبت مشتری ناموفق بود"),
  });

  return (
    <form
      className="flex flex-1 flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (firstName.trim()) create.mutate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <p className="font-bold">مشتری جدید</p>

      <div className="grid max-w-2xl grid-cols-2 gap-3">
        <Field label="نام">
          <Input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="نام خانوادگی">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="شماره تماس">
          <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="دسته">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="h-9" disabled={!firstName.trim() || create.isPending}>
          ثبت مشتری
        </Button>
        <Button type="button" variant="ghost" className="h-9" onClick={onCancel}>
          انصراف (Esc)
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
