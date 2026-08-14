"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getActiveCustomerCategories, searchCustomersPaged, type CustomerSort } from "@/lib/api";
import { toFa } from "@/lib/format";
import { Money } from "@/components/money";
import { CustomerCategoryBadge } from "@/components/customer-category-badge";
import { CreateCustomerDialog } from "./_components/create-customer-dialog";

/**
 * فهرست مشتریان.
 *
 * ستون بدهی عمداً اولین چیزی است که چشم می‌گیرد — دلیلِ اصلیِ باز کردن این
 * صفحه «چه کسی چقدر بدهکار است» است، نه دفترچه تلفن. برای همین مرتب‌سازیِ
 * پیش‌فرض «بیشترین بدهی» است؛ جست‌وجو اما همچنان روی نام و شماره کار می‌کند.
 */
const SORTS: { key: CustomerSort; label: string }[] = [
  { key: "dueDesc", label: "بیشترین بدهی" },
  { key: "name", label: "نام" },
  { key: "newest", label: "جدیدترین" },
  { key: "dueAsc", label: "کمترین بدهی" },
];

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [sortBy, setSortBy] = React.useState<CustomerSort>("dueDesc");
  const [categoryId, setCategoryId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [showCreate, setShowCreate] = React.useState(false);

  /** دسته‌های فعال برای فیلتر. */
  const categories = useQuery({
    queryKey: ["customer-categories", "active"],
    queryFn: getActiveCustomerCategories,
  });

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // جست‌وجو یا تغییر مرتب‌سازی یا فیلتر = فهرست از نو؛ برگرد به صفحه‌ی اول.
  React.useEffect(() => {
    setPage(1);
  }, [debounced, sortBy, categoryId]);

  const list = useQuery({
    queryKey: ["customers", debounced, sortBy, categoryId, page],
    queryFn: () =>
      searchCustomersPaged({
        q: debounced,
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        categoryId: categoryId || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مشتریان"
        description="حساب، بدهی و گردش مالی مشتری‌ها"
        icon={Users}
      />        <div className="flex flex-wrap items-center gap-3">
          <Button className="h-11 gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> مشتری جدید
          </Button>

        <div className="relative max-w-md flex-1">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام یا شماره تماس…"
            className="h-11 pe-10"
          />
        </div>

        {/* فیلتر دسته — دیدن مشتری‌های یک دسته در یک نگاه */}
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
          aria-label="فیلتر بر اساس دسته"
        >
          <option value="">همه دسته‌ها</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`h-10 rounded-md px-4 text-sm font-medium transition-colors ${
                sortBy === s.key
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background hover:bg-primary/5"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {debounced ? "مشتری‌ای پیدا نشد" : "هنوز مشتری‌ای ثبت نشده"}
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">نام</TableHead>
                    <TableHead className="text-start">شماره</TableHead>
                    <TableHead className="text-end">بدهی (ریال)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const due = c.summary?.totalDue ?? 0;
                    return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="block font-medium hover:underline"
                      >
                        {c.fullName}
                      </Link>
                      {c.category && (
                        <CustomerCategoryBadge category={c.category} className="mt-1" />
                      )}
                    </TableCell>
                    <TableCell dir="ltr" className="text-start text-muted-foreground">
                      {c.phones?.[0]?.phone ? toFa(c.phones[0].phone) : "—"}
                    </TableCell>
                        <TableCell className="text-end">
                          {due > 0 ? (
                            <span className="inline-flex items-center gap-1.5 font-semibold">
                              <AlertTriangle className="size-3.5 text-warning" />
                              <Money value={due} tone="due" />
                            </span>
                          ) : (
                            <span className="tabular-nums text-muted-foreground">۰</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {meta && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="size-4" /> قبلی
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {toFa(meta.total)} مشتری
                {meta.pageCount > 1
                  ? ` · صفحه ${toFa(meta.page)} از ${toFa(meta.pageCount)}`
                  : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی <ChevronLeft className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <CreateCustomerDialog
        open={showCreate}
        onDone={(created) => {
          setShowCreate(false);
          if (created) list.refetch();
        }}
      />
    </div>
  );
}
