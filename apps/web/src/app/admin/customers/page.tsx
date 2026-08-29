"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CustomerCategoryBadge } from "@/components/customer-category-badge";
import { ErrorState } from "@/components/states";

import {
  deactivateCustomer,
  getActiveCustomerCategories,
  searchCustomersPaged,
  type CustomerSort,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money, toFa } from "@/lib/format";
import { useAuthStore } from "@/lib/auth-store";
import type { Customer } from "@/lib/types";
import { CreateCustomerDialog } from "./_components/create-customer-dialog";

/**
 * فهرست مشتریان — یک کادر جست‌وجو، یک جدول، یک نوار کلید.
 *
 * همان الگوی ریزگردشِ صندوق: هیچ دکمه‌ای روی ردیف‌ها نیست، هر کاری یک کلید
 * دارد، و ستون بدهی اولین چیزی است که چشم می‌گیرد — دلیلِ اصلیِ باز کردن این
 * صفحه «چه کسی چقدر بدهکار است» است، نه دفترچه تلفن.
 *
 * چیدمانِ کارت‌محورِ قبلی (PageHeader + Card + دکمه‌های بزرگ) حذف شد: روی
 * لپ‌تاپِ پیشخوان، آن سرصفحه‌ها نصفِ صفحه را می‌گرفتند و فهرست به هشت ردیف
 * می‌رسید.
 */
const SORTS: { key: CustomerSort; label: string }[] = [
  { key: "dueDesc", label: "بیشترین بدهی" },
  { key: "name", label: "نام" },
  { key: "newest", label: "جدیدترین" },
  { key: "dueAsc", label: "کمترین بدهی" },
];

const PAGE_SIZE = 50;

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

export default function CustomersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.hasRole("ADMIN", "MANAGER"));

  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [sortBy, setSortBy] = React.useState<CustomerSort>("dueDesc");
  const [categoryId, setCategoryId] = React.useState("");
  const [onlyDebtors, setOnlyDebtors] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [row, setRow] = React.useState(0);
  const [showCreate, setShowCreate] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState<Customer | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);

  const doDeactivate = useMutation({
    mutationFn: (id: string) => deactivateCustomer(id),
    onSuccess: (c) => {
      toast.success(`مشتری «${c.fullName}» غیرفعال شد`);
      setDeactivating(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["debtors"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiException ? e.message : "غیرفعال‌سازی مشتری ناموفق بود"),
  });

  const categories = useQuery({
    queryKey: ["customer-categories", "active"],
    queryFn: getActiveCustomerCategories,
  });

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    setPage(1);
    setRow(0);
  }, [debounced, sortBy, categoryId, onlyDebtors]);

  const list = useQuery({
    queryKey: ["customers", debounced, sortBy, categoryId, onlyDebtors, page],
    queryFn: () =>
      searchCustomersPaged({
        q: debounced,
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        categoryId: categoryId || undefined,
        onlyDebtors: onlyDebtors || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  /** ردیفِ فعال همیشه باید دیده شود — فهرست ۵۰تایی است و کیبورد اسکرول نمی‌کند. */
  React.useEffect(() => {
    document.querySelector('[data-active-row="true"]')?.scrollIntoView({ block: "nearest" });
  }, [row, rows.length]);

  const open = (c: Customer | undefined) => {
    if (c) router.push(`/admin/customers/${c.id}`);
  };

  return (
    <div
      // tabIndex تا اگر کاربر جایی بیرون از کادرِ جست‌وجو کلیک کرد، کلیدها
      // همچنان به این هندلر برسند.
      tabIndex={-1}
      className="flex h-[calc(100vh-2.5rem)] flex-col outline-none"
      onKeyDown={(e) => {
        if (deactivating || showCreate) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 1, Math.max(rows.length - 1, 0)));
            return;
          case "ArrowUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 1, 0));
            return;
          case "PageDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 12, Math.max(rows.length - 1, 0)));
            return;
          case "PageUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 12, 0));
            return;
          case "Enter":
            e.preventDefault();
            open(rows[row]);
            return;
          case "Insert":
            e.preventDefault();
            setShowCreate(true);
            return;
          case "Escape":
            e.preventDefault();
            // Esc جست‌وجو را پاک می‌کند؛ دوباره Esc کاری ندارد چون صفحه‌ی اصلی است.
            setQ("");
            searchRef.current?.focus();
            return;
        }

        // Delete فقط با نقشِ مدیر، و همیشه با تأیید — soft delete است ولی
        // برگرداندنش دستِ کاربر نیست.
        if (e.key === "Delete" && canManage && rows[row]) {
          e.preventDefault();
          setDeactivating(rows[row]);
        }
      }}
    >
      {/* یک سطر: جست‌وجو + فیلترها. بدون سرصفحه و بدون کارت. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام یا شماره تماس…"
            className="h-8 pe-9 text-sm"
          />
        </div>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="فیلتر دسته"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">همه دسته‌ها</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOnlyDebtors((v) => !v)}
          className={`h-8 rounded-md border px-3 text-sm font-medium ${
            onlyDebtors ? "border-warning bg-warning/10 text-warning" : "bg-background"
          }`}
        >
          فقط بدهکاران
        </button>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as CustomerSort)}
          aria-label="مرتب‌سازی"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground">
          {meta ? `${toFa(meta.total)} مشتری` : ""}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {list.isFetching ? "…" : "مشتری‌ای پیدا نشد"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-12`}>ردیف</th>
                <th className={TH}>نام</th>
                <th className={`${TH} w-36`}>شماره</th>
                <th className={`${TH} w-32`}>دسته</th>
                <th className={`${TH} w-40`}>بدهی</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id}
                  data-active-row={i === row}
                  className="cursor-pointer border-b odd:bg-muted/25"
                  onMouseEnter={() => setRow(i)}
                  onClick={() => open(c)}
                >
                  <td className={`${TD} tabular-nums text-muted-foreground`}>
                    {toFa((page - 1) * PAGE_SIZE + i + 1)}
                  </td>
                  <td className={`${TD} font-semibold`}>{c.fullName}</td>
                  <td dir="ltr" className={`${TD} text-start text-muted-foreground`}>
                    {c.phones?.find((p) => p.isPrimary)?.phone ?? c.phones?.[0]?.phone ?? "—"}
                  </td>
                  <td className={TD}>
                    {c.category ? <CustomerCategoryBadge category={c.category} /> : "—"}
                  </td>
                  <td
                    className={`${TD} text-end font-bold tabular-nums ${
                      c.summary?.totalDue ? "text-warning" : "text-muted-foreground"
                    }`}
                  >
                    {c.summary?.totalDue ? money(c.summary.totalDue) : "۰"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-x-5 overflow-x-auto whitespace-nowrap border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        {(
          [
            ["↑↓", "حرکت"],
            ["Enter", "پرونده‌ی مشتری"],
            ["Insert", "مشتری جدید"],
            ...(canManage ? [["Delete", "غیرفعال کردن"]] : []),
            ["Esc", "پاک کردن جست‌وجو"],
          ] as [string, string][]
        ).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]">
              {k}
            </kbd>
            {label}
          </span>
        ))}

        {meta && meta.pageCount > 1 && (
          <span className="ms-auto flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border bg-background px-2 py-0.5 disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="tabular-nums">
              {toFa(page)} از {toFa(meta.pageCount)}
            </span>
            <button
              type="button"
              disabled={page >= meta.pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border bg-background px-2 py-0.5 disabled:opacity-40"
            >
              بعدی
            </button>
          </span>
        )}
      </div>

      <CreateCustomerDialog open={showCreate} onDone={() => setShowCreate(false)} />

      <ConfirmDialog
        open={!!deactivating}
        title="غیرفعال کردن مشتری"
        description={`«${deactivating?.fullName}» دیگر در فهرست‌ها نمی‌آید. سابقه‌ی فاکتورها و گردش حسابش پاک نمی‌شود.`}
        confirmText="غیرفعال کن"
        destructive
        loading={doDeactivate.isPending}
        onConfirm={() => deactivating && doDeactivate.mutate(deactivating.id)}
        onOpenChange={(v) => !v && setDeactivating(null)}
      />
    </div>
  );
}
