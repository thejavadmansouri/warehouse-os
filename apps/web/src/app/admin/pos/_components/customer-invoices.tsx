"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  createCustomer,
  getActiveCustomerCategories,
  getInvoices,
  searchCustomers,
} from "@/lib/api";
import { money, toFa } from "@/lib/format";
import { CustomerLedgerTable, toLedgerRows } from "@/components/customer-ledger";
import type { Customer } from "@/lib/types";

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
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<Customer | null>(null);
  const [row, setRow] = useState(0);
  const [creating, setCreating] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setDebounced("");
    setCreating(false);
    setRow(0);
    setPicked(mode === "ledger" ? initialCustomer : null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, mode, initialCustomer]);

  const results = useQuery({
    queryKey: ["pos-customer-lookup", debounced],
    queryFn: () => searchCustomers(debounced, 50),
    enabled: open && !picked && !creating,
  });

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

  const count = picked ? ledger.length : customers.length;
  useEffect(() => setRow(0), [debounced, picked?.id]);

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
          openLedger(customers[row]);
          return;
        }

        if (e.key !== "Enter") return;
        e.preventDefault();

        if (!picked) {
          const c = customers[row];
          // Ctrl+Enter = «نمی‌خواهم انتخابش کنم، فقط حسابش را ببینم».
          if (c) (e.ctrlKey || e.metaKey ? openLedger : onPickCustomer)(c);
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
                  <b className="tabular-nums text-warning">
                    {money(ledger.at(-1)?.balance ?? 0)}
                  </b>
                </span>
              </>
            ) : (
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="نام، فامیل یا شماره‌ی مشتری…"
                className="h-9 text-base"
              />
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
                  ["Enter", "باز کردن فاکتور برای ویرایش"],
                  ["Alt+Enter", "برگشت از فروش"],
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
