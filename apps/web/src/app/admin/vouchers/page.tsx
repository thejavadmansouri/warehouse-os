"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ExternalLink, ScrollText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/data-table-pagination";
import { ActiveFilters, ListToolbar, type ActiveFilter } from "@/components/list-toolbar";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { sourceHrefFor } from "@/components/voucher-card";
import { useAuthStore } from "@/lib/auth-store";
import { getVouchers } from "@/lib/api";
import { faDate, faTime, money, toFa } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VoucherRow, VoucherSourceType } from "@/lib/types";

/** برچسب فارسیِ نوع سند — با enum سمت سرور هماهنگ. */
const SOURCE_LABELS: Record<string, string> = {
  SALE_INVOICE: "فاکتور فروش",
  SALE_CANCEL: "ابطال فاکتور",
  RECEIPT: "دریافت وجه",
  SALE_RETURN: "مرجوعی",
  SALE_CORRECTION: "اصلاحیه",
  PURCHASE_INVOICE: "فاکتور خرید",
  PURCHASE_CANCEL: "ابطال فاکتور خرید",
};

const PAGE_SIZE = 20;

/** جمعِ بدهکار/بستانکارِ یک سند — فقط جمعِ نمایشیِ خطوطی که سرور فرستاده. */
function totals(v: VoucherRow) {
  let debit = 0;
  let credit = 0;
  for (const l of v.lines) {
    debit += l.debit;
    credit += l.credit;
  }
  return { debit, credit };
}

const NUM = "text-end tabular-nums";

export default function VouchersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "ADMIN" || role === "MANAGER";

  const [sourceType, setSourceType] = React.useState<VoucherSourceType | "">("");
  const [from, setFrom] = React.useState<string | undefined>(undefined);
  const [to, setTo] = React.useState<string | undefined>(undefined);
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const list = useQuery({
    queryKey: ["vouchers", sourceType, from, to, page],
    queryFn: () => getVouchers({ sourceType, from, to, page, limit: PAGE_SIZE }),
    enabled: isManager,
  });

  const hasFilter = sourceType !== "" || !!from || !!to;

  const reset = () => {
    setSourceType("");
    setFrom(undefined);
    setTo(undefined);
    setPage(1);
  };

  const activeFilters: ActiveFilter[] = [
    ...(sourceType
      ? [{
          key: "type",
          label: `نوع: ${SOURCE_LABELS[sourceType] ?? sourceType}`,
          onRemove: () => { setSourceType(""); setPage(1); },
        }]
      : []),
    ...(from
      ? [{ key: "from", label: `از ${faDate(from)}`, onRemove: () => { setFrom(undefined); setPage(1); } }]
      : []),
    ...(to
      ? [{ key: "to", label: `تا ${faDate(to)}`, onRemove: () => { setTo(undefined); setPage(1); } }]
      : []),
  ];

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const pageTotals = rows.reduce(
    (acc, v) => {
      const t = totals(v);
      return { debit: acc.debit + t.debit, credit: acc.credit + t.credit };
    },
    { debit: 0, credit: 0 }
  );
  const pageBalanced = pageTotals.debit === pageTotals.credit;

  return (
    <div className="space-y-4">
      <PageHeader
        title="دفتر روزنامه"
        description="سندِ خودکارِ پشتِ هر اکشن مالی — جمعِ بدهکار هر سند همیشه با بستانکارش برابر است"
        icon={ScrollText}
      />

      {!isManager ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          این صفحه فقط برای مدیر است.
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <ListToolbar
              actions={
                meta ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {toFa(meta.total)} سند
                  </span>
                ) : null
              }
            >
              <Select
                value={sourceType || "all"}
                onValueChange={(v) => {
                  setSourceType(v === "all" ? "" : (v as VoucherSourceType));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-44" aria-label="نوع سند">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه‌ی انواع سند</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">از</span>
                <JalaliDateInput
                  value={from}
                  onChange={(iso) => {
                    setFrom(iso);
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">تا</span>
                <JalaliDateInput
                  value={to}
                  onChange={(iso) => {
                    setTo(iso);
                    setPage(1);
                  }}
                />
              </div>
            </ListToolbar>

            <ActiveFilters filters={activeFilters} onClearAll={reset} />
          </div>

          {list.isLoading ? (
            <LoadingState label="در حال بارگذاری سندها..." />
          ) : list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="سندی یافت نشد"
              description={
                hasFilter
                  ? "با این فیلترها سندی ثبت نشده است"
                  : "هنوز هیچ اکشن مالی ثبت نشده — با اولین فاکتور، اولین سند اینجا می‌نشیند"
              }
            />
          ) : (
            <>
              <Card className="overflow-hidden p-0">
                <Table containerClassName="max-h-[calc(100vh-17rem)] overflow-y-auto">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead className="w-12">ردیف</TableHead>
                      <TableHead className="w-28">تاریخ</TableHead>
                      <TableHead className="w-24">شماره سند</TableHead>
                      <TableHead className="w-36">نوع سند</TableHead>
                      <TableHead>شرح</TableHead>
                      <TableHead className="w-44">طرف حساب / مرجع</TableHead>
                      <TableHead className={cn(NUM, "w-36")}>بدهکار</TableHead>
                      <TableHead className={cn(NUM, "w-36")}>بستانکار</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {rows.map((v, i) => (
                      <VoucherLedgerRows
                        key={v.id}
                        voucher={v}
                        index={(page - 1) * PAGE_SIZE + i + 1}
                        open={expanded.has(v.id)}
                        onToggle={() => toggle(v.id)}
                      />
                    ))}
                  </TableBody>

                  <TableFooter className="sticky bottom-0 z-10 bg-muted/95 backdrop-blur">
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="font-bold">
                        <span className="flex flex-wrap items-center gap-2">
                          جمع این صفحه
                          {pageBalanced ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              · تراز است
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-destructive">
                              · اختلاف {money(Math.abs(pageTotals.debit - pageTotals.credit))}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className={cn(NUM, "font-bold")}>{money(pageTotals.debit)}</TableCell>
                      <TableCell className={cn(NUM, "font-bold")}>{money(pageTotals.credit)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </Card>

              {meta ? (
                <DataTablePagination
                  page={meta.page}
                  totalPages={Math.max(1, Math.ceil(meta.total / meta.limit))}
                  onChange={setPage}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * یک سند در دفتر: ردیفِ سرصفحه (جمع بدهکار/بستانکار) + خطوطِ حساب‌ها وقتی باز است.
 * خطوط با تورفتگی زیر «شرح» می‌نشینند — همان شکلِ دفتر روزنامه‌ی کاغذی.
 */
function VoucherLedgerRows({
  voucher: v,
  index,
  open,
  onToggle,
}: {
  voucher: VoucherRow;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { debit, credit } = totals(v);
  const balanced = debit === credit;
  const { href, label } = sourceHrefFor(v);
  const isReversal = !!v.reversesVoucherId;
  const cp = v.counterparty;
  const linesId = `voucher-lines-${v.id}`;

  return (
    <>
      <TableRow
        className={cn("cursor-pointer", open && "bg-muted/40")}
        onClick={onToggle}
      >
        <TableCell className="tabular-nums text-muted-foreground">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-controls={linesId}
            aria-label={open ? "بستن خطوط سند" : "نمایش خطوط سند"}
            className="inline-flex items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-ring"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
            {toFa(index)}
          </button>
        </TableCell>
        <TableCell className="tabular-nums">
          <div>{faDate(v.createdAt)}</div>
          <div className="text-xs text-muted-foreground">{faTime(v.createdAt)}</div>
        </TableCell>
        <TableCell className="tabular-nums font-semibold">
          {href ? (
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              title={label}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {toFa(v.number)}
              <ExternalLink className="size-3 opacity-60" />
            </Link>
          ) : (
            toFa(v.number)
          )}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={cn(
              "font-normal",
              isReversal && "border-destructive/40 text-destructive"
            )}
          >
            {v.sourceLabel}
          </Badge>
        </TableCell>
        <TableCell className="max-w-0 whitespace-normal">
          <span className="line-clamp-2 text-sm">{v.note ?? "—"}</span>
          {!balanced ? (
            <span className="text-xs font-semibold text-destructive">سند نامتوازن</span>
          ) : null}
        </TableCell>
        <TableCell className="whitespace-normal">
          {cp ? (
            <Link
              href={cp.kind === "CUSTOMER" ? `/admin/customers/${cp.id}` : `/admin/suppliers/${cp.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              {cp.name}
              <span className="ms-1 text-xs text-muted-foreground">
                {cp.kind === "CUSTOMER" ? "(مشتری)" : "(تأمین‌کننده)"}
              </span>
            </Link>
          ) : (
            <span className="text-muted-foreground">عمومی</span>
          )}
        </TableCell>
        <TableCell className={cn(NUM, "font-semibold")}>{money(debit)}</TableCell>
        <TableCell className={cn(NUM, "font-semibold")}>{money(credit)}</TableCell>
      </TableRow>

      {open
        ? v.lines.map((l, li) => (
            <TableRow
              key={`${v.id}-${li}`}
              id={li === 0 ? linesId : undefined}
              className="border-border/30 bg-muted/20 text-sm hover:bg-muted/30"
            >
              <TableCell colSpan={4} />
              {/* بستانکار در دفترِ سنتی با تورفتگیِ بیشتر نوشته می‌شود. */}
              <TableCell className={cn("whitespace-normal", l.credit > 0 ? "ps-10" : "ps-5")}>
                <span className="font-medium">{l.accountLabel}</span>
                {l.note ? (
                  <span className="ms-2 text-xs text-muted-foreground">{l.note}</span>
                ) : null}
              </TableCell>
              <TableCell />
              <TableCell className={cn(NUM, "text-muted-foreground")}>
                {l.debit > 0 ? money(l.debit) : ""}
              </TableCell>
              <TableCell className={cn(NUM, "text-muted-foreground")}>
                {l.credit > 0 ? money(l.credit) : ""}
              </TableCell>
            </TableRow>
          ))
        : null}
    </>
  );
}
