"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CustomerCategoryBadge } from "@/components/customer-category-badge";
import { DataTablePagination } from "@/components/data-table-pagination";
import { ActiveFilters, ListToolbar, type ActiveFilter } from "@/components/list-toolbar";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

import {
  deactivateCustomer,
  getActiveCustomerCategories,
  searchCustomersPaged,
  type CustomerSort,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { money, toFa } from "@/lib/format";
import { balanceTextClass } from "@/components/finance-badges";
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

/** مبلغ: هدر و سلول هر دو end — وگرنه «بدهی» راست است و عدد چپ. */
const NUM = "text-end tabular-nums";

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

  /*
   * تغییرِ فیلتر، صفحه و ردیفِ فعال را به اول برمی‌گرداند.
   *
   * همان الگوی «تطبیق state در رندر» که در صندوق استفاده می‌شود: تغییر را با
   * stateِ قبلی مقایسه می‌کنیم و در خودِ رندر اصلاحش می‌کنیم — نه setStateِ
   * همزمان داخل effect (قانونِ lint).
   */
  const [filterKey, setFilterKey] = React.useState("");
  const nextFilterKey = `${debounced}|${sortBy}|${categoryId}|${onlyDebtors}`;
  if (filterKey !== nextFilterKey) {
    setFilterKey(nextFilterKey);
    setPage(1);
    setRow(0);
  }

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

  const categoryName = categories.data?.find((c) => c.id === categoryId)?.name;
  const activeFilters: ActiveFilter[] = [
    ...(debounced ? [{ key: "q", label: `جست‌وجو: ${debounced}`, onRemove: () => setQ("") }] : []),
    ...(categoryId
      ? [{ key: "cat", label: `دسته: ${categoryName ?? "…"}`, onRemove: () => setCategoryId("") }]
      : []),
    ...(onlyDebtors
      ? [{ key: "debt", label: "فقط بدهکاران", onRemove: () => setOnlyDebtors(false) }]
      : []),
  ];

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
      <div className="shrink-0 space-y-2 border-b px-3 py-2">
        <ListToolbar
          actions={
            <>
              <span className="text-xs text-muted-foreground tabular-nums">
                {meta ? `${toFa(meta.total)} مشتری` : ""}
              </span>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" />
                مشتری جدید
                <kbd className="rounded bg-primary-foreground/20 px-1 font-sans text-[10px]">Ins</kbd>
              </Button>
            </>
          }
        >
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
            aria-pressed={onlyDebtors}
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
        </ListToolbar>

        <ActiveFilters
          filters={activeFilters}
          onClearAll={() => {
            setQ("");
            setCategoryId("");
            setOnlyDebtors(false);
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {list.isError ? (
          <ErrorState className="m-3" onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          list.isFetching ? (
            <LoadingState label="در حال جست‌وجوی مشتریان..." />
          ) : (
            <EmptyState
              className="m-3"
              title="مشتری‌ای پیدا نشد"
              description={
                activeFilters.length
                  ? "فیلترها یا عبارت جست‌وجو را تغییر دهید."
                  : "با کلید Insert اولین مشتری را ثبت کنید."
              }
            />
          )
        ) : (
          <Table containerClassName="min-h-0 flex-1 overflow-y-auto">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-14">ردیف</TableHead>
                <TableHead>نام</TableHead>
                <TableHead className="w-40 text-end">شماره</TableHead>
                <TableHead className="w-36">دسته</TableHead>
                <TableHead className={`${NUM} w-44`}>بدهی (ریال)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c, i) => {
                const phone =
                  c.phones?.find((p) => p.isPrimary)?.phone ??
                  c.phones?.[0]?.phone ??
                  null;
                return (
                <TableRow
                  key={c.id}
                  data-active-row={i === row}
                  className="cursor-pointer"
                  onMouseEnter={() => setRow(i)}
                  onClick={() => open(c)}
                >
                  <TableCell className="tabular-nums text-muted-foreground">
                    {toFa((page - 1) * PAGE_SIZE + i + 1)}
                  </TableCell>
                  <TableCell className="whitespace-normal font-semibold">{c.fullName}</TableCell>
                  {/* تلفن: LTR برای ترتیب ارقام، text-end تا زیر هدرِ RTL بنشیند. */}
                  <TableCell dir="ltr" className="text-end tabular-nums text-muted-foreground">
                    {phone ? toFa(phone) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.category ? <CustomerCategoryBadge category={c.category} /> : "—"}
                  </TableCell>
                  <TableCell
                    className={`${NUM} font-bold ${
                      c.summary?.totalDue
                        ? balanceTextClass(c.summary.totalDue)
                        : "text-muted-foreground"
                    }`}
                  >
                    {c.summary?.totalDue ? (
                      <span className="inline-flex items-center justify-end gap-1">
                        {/* منفی فقط عدد بود (علامتِ انگلیسی جلوی ارقام فارسی) — حالا
                            برچسبِ جهت دارد و عدد همیشه مثبت نمایش داده می‌شود. */}
                        {c.summary.totalDue < 0 && (
                          <span className="text-[10px] font-semibold text-emerald-600">
                            بستانکار
                          </span>
                        )}
                        {money(Math.abs(c.summary.totalDue))}
                      </span>
                    ) : (
                      "۰"
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

        {meta ? (
          <span className="ms-auto">
            <DataTablePagination
              className="mt-0 [&_a]:h-7 [&_a]:min-w-7"
              page={page}
              totalPages={meta.pageCount}
              onChange={setPage}
            />
          </span>
        ) : null}
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
