"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet,
  ArrowRight,
  ShoppingCart,
  Percent,
  Printer,
  MapPin,
  IdCard,
  Tag,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  UserX,
} from "lucide-react";

import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { StatusBadge } from "@/components/status-badge";
import { CustomerCategoryBadge } from "@/components/customer-category-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";

import {
  adjustBalance,
  deactivateCustomer,
  getCustomer,
  getCustomerStats,
  getInvoices,
  getStatement,
  setOpeningBalance,
  updateCustomer,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { amount, faDate, faToEn, money, parseNum, toFa } from "@/lib/format";
import { bpToPercent, percentToBp } from "@/lib/cheque-charge";
import { useAuthStore } from "@/lib/auth-store";
import { TakePayment } from "./_components/take-payment";
import { EditCustomerDialog } from "./_components/edit-customer-dialog";
import { SmsDialog } from "./_components/sms-dialog";
import { StatementTable } from "./_components/statement-table";
import type { Customer, Invoice } from "@/lib/types";

import { unitLabel } from "@/lib/currency";
/** فیلتر فاکتورهای مشتری — پیش‌فرض «امروز» با ردیف‌های باز. */
type InvoiceFilter = "today" | "all" | "range";
const INVOICE_FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "today", label: "امروز" },
  { key: "all", label: "کلی" },
  { key: "range", label: "بازه‌ی تاریخ" },
];

/** ابتدای امروز به‌صورت ISO — فیلترِ «امروز». */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** پایانِ همان روز — تا فیلترِ «تا تاریخ» کلِ آن روز را بگیرد. */
function endOfDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * پرونده‌ی مشتری.
 *
 * هدف صریح: مدیر در پنج ثانیه بفهمد این مشتری چه وضعیتی دارد. پس بالای صفحه
 * چند مربع کوچک است (مانده + گزارش‌ها) و بلافاصله بعدش فاکتورها و اقلام می‌آید
 * — تا تمرکزِ صفحه روی خریدهایش باشد؛ گردش حسابِ کامل پایین‌تر جواب می‌دهد
 * «این عدد از کجا آمد».
 */
export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "ADMIN" || role === "MANAGER";

  /** مشتریِ در حال غیرفعال‌سازی — تا تأییدِ مدیر، این‌جا می‌ماند. */
  const [deactivating, setDeactivating] = React.useState(false);
  const doDeactivate = useMutation({
    mutationFn: () => deactivateCustomer(id),
    onSuccess: () => {
      toast.success("مشتری غیرفعال شد");
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["debtors"] });
      // غیرفعال‌شده از فهرست‌ها حذف می‌شود — به لیست برگرد.
      router.push("/admin/customers");
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiException
          ? e.message
          : "غیرفعال‌سازی مشتری ناموفق بود"
      );
    },
  });

  const customer = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id),
  });

  // گردش حساب — پیش‌فرض «کل تاریخچه»، با بازه‌ی اختیاری.
  const [stmtFrom, setStmtFrom] = React.useState("");
  const [stmtTo, setStmtTo] = React.useState("");

  const statement = useQuery({
    queryKey: ["statement", id, stmtFrom, stmtTo],
    queryFn: () =>
      getStatement(id, {
        startDate: stmtFrom || undefined,
        endDate: stmtTo ? endOfDay(stmtTo) : undefined,
        limit: 200,
      }),
    placeholderData: keepPreviousData,
  });

  // فاکتورها و اقلام — فیلترِ پیش‌فرض «امروز» است.
  const [purchFilter, setPurchFilter] = React.useState<InvoiceFilter>("today");
  const [rangeFrom, setRangeFrom] = React.useState("");
  const [rangeTo, setRangeTo] = React.useState("");
  const [invPage, setInvPage] = React.useState(1);

  const purchases = useQuery({
    queryKey: ["customer-purchases", id, purchFilter, rangeFrom, rangeTo, invPage],
    queryFn: () => {
      const params: Parameters<typeof getInvoices>[0] = {
        customerId: id,
        includeLines: true,
        page: invPage,
        pageSize: 50,
      };
      if (purchFilter === "today") params.from = startOfToday();
      if (purchFilter === "range") {
        if (rangeFrom) params.from = rangeFrom;
        if (rangeTo) params.to = endOfDay(rangeTo);
      }
      return getInvoices(params);
    },
    placeholderData: keepPreviousData,
  });

  /** آمار خرید دوره‌ای — این ماه، ماه قبل، کل و میانگین فاکتور. */
  const stats = useQuery({
    queryKey: ["customer-stats", id],
    queryFn: () => getCustomerStats(id),
  });

  // ردیفِ OPENING فقط بدونِ بازه معنا دارد — با بازه‌ی فعال، فرمِ مانده‌ی اول دوره پنهان می‌شود.
  const hasOpening =
    !stmtFrom && !stmtTo
      ? (statement.data?.rows.data.some((e) => e.type === "OPENING") ?? false)
      : undefined;

  if (customer.isLoading) return <LoadingState />;
  if (customer.isError || !customer.data) {
    return <ErrorState onRetry={() => customer.refetch()} />;
  }

  const c = customer.data;
  const s = c.summary;
  const totalDue = s?.totalDue ?? 0;

  /** فاکتورهایی که هنوز مانده دارند — منبعِ همین عددِ بدهی. */
  const openInvoices = (c.invoices ?? []).filter(
    (i) => i.status === "CONFIRMED" && i.dueAmount > 0
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer", id] });
    qc.invalidateQueries({ queryKey: ["statement", id] });
    qc.invalidateQueries({ queryKey: ["customer-purchases", id] });
    qc.invalidateQueries({ queryKey: ["customer-stats", id] });
  };

  const purchaseRows = purchases.data?.data ?? [];
  const purchasesMeta = purchases.data?.meta;
  // باطل‌شده پول‌اش برگشته — در جمع نمی‌آید.
  const purchasesTotal = purchaseRows
    .filter((r) => r.status !== "CANCELLED")
    .reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/customers"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{c.fullName}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span dir="ltr">
              {c.phones?.[0]?.phone ? toFa(c.phones[0].phone) : "بدون شماره"}
            </span>
            {c.category && <CustomerCategoryBadge category={c.category} />}
            {c.nationalId && (
              <span className="flex items-center gap-1">
                <IdCard className="size-3.5" /> کد ملی {toFa(c.nationalId)}
              </span>
            )}
            {c.address && (
              <span className="flex min-w-0 items-center gap-1 truncate">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{c.address}</span>
              </span>
            )}
          </div>
        </div>
        <SmsDialog customer={c} />
        <EditCustomerDialog customer={c} onDone={refresh} />
        {isManager && (
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeactivating(true)}
          >
            <UserX className="size-4" /> غیرفعال‌سازی
          </Button>
        )}
        {/* برگه‌ای که مشتری می‌خواهد ببرد — پنجره‌ی جدا تا این صفحه بماند. */}
        <Button
          variant="outline"
          onClick={() => window.open(`/admin/print/statement/${c.id}`, "_blank")}
        >
          <Printer className="size-4" /> صورت‌حساب
        </Button>
        <Button asChild variant="outline">
          <Link href={`/admin/pos?customer=${c.id}`}>
            <ShoppingCart className="size-4" /> فروش به این مشتری
          </Link>
        </Button>
      </div>

      {/* مانده و گزارش‌ها — مربع‌های کوچک، تا تمرکزِ صفحه روی فاکتورها بماند. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">مانده‌ی حساب</p>
          <p
            className={`mt-0.5 truncate text-xl font-bold tabular-nums ${
              totalDue > 0
                ? "text-amber-600 dark:text-amber-400"
                : totalDue < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ""
            }`}
          >
            {money(Math.abs(totalDue))}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalDue > 0 ? "بدهکار" : totalDue < 0 ? "بستانکار" : "تسویه"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <Stat label="جاری" value={s?.current ?? 0} />
        </div>
        <div className="rounded-lg border bg-card p-3">
          <Stat label="سررسید امروز" value={s?.dueToday ?? 0} tone="amber" />
        </div>
        <div className="rounded-lg border bg-card p-3">
          <Stat label="سررسید گذشته" value={s?.overdue ?? 0} tone="red" />
        </div>
        <div className="rounded-lg border bg-card p-3">
          <Stat label="چک در جریان وصول" value={s?.chequesInHandCount ?? 0} count />
        </div>
      </div>

      {(c.creditLimit ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          سقف اعتبار {amount(c.creditLimit!)} · اعتبار باقی‌مانده{" "}
          <span className="tabular-nums">
            {money(Math.max(0, (c.creditLimit ?? 0) - totalDue))}
          </span>
          {(c.creditDays ?? 0) > 0 && ` · مهلت ${toFa(c.creditDays!)} روز`}
        </p>
      )}

      {/* آمار خرید دوره‌ای — روند خرید مشتری در یک نگاه */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4" /> خرید دوره‌ای
        </div>
        {stats.isLoading ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            در حال محاسبه…
          </p>
        ) : stats.data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PeriodStat
              label="این ماه"
              total={stats.data.thisMonth.total}
              count={stats.data.thisMonth.count}
            />
            <PeriodStat
              label="ماه قبل"
              total={stats.data.lastMonth.total}
              count={stats.data.lastMonth.count}
            />
            <PeriodStat
              label="کل خرید"
              total={stats.data.allTime.total}
              count={stats.data.allTime.count}
            />
            <PeriodStat
              label="میانگین هر فاکتور"
              total={stats.data.averageInvoice}
            />
          </div>
        ) : null}
      </div>

      {/* فاکتورها و اقلام — همه‌ی خریدهای مشتری، فیلتر «امروز/کلی/بازه» */}
      <Card className="p-0">
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">فاکتورها و اقلام خرید</h2>
            <div className="flex gap-1">
              {INVOICE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setPurchFilter(f.key); setInvPage(1); }}
                  className={`h-9 rounded-md px-4 text-sm font-medium transition-colors ${
                    purchFilter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "border bg-background hover:bg-primary/5"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {purchFilter === "range" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">از تاریخ</label>
                <JalaliDateInput
                  value={rangeFrom}
                  onChange={(v) => { setRangeFrom(v); setInvPage(1); }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">تا تاریخ</label>
                <JalaliDateInput
                  value={rangeTo}
                  onChange={(v) => { setRangeTo(v); setInvPage(1); }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4">
          {purchases.isLoading ? (
            <LoadingState />
          ) : purchaseRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {purchFilter === "today"
                ? "امروز خریدی برای این مشتری ثبت نشده"
                : "فاکتوری در این بازه پیدا نشد"}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="tabular-nums">{toFa(purchaseRows.length)} فاکتور</span>
                <span>
                  مجموع خرید:{" "}
                  <span className="font-bold tabular-nums">{money(purchasesTotal)}</span>
                </span>
              </div>

              {/* key عوض‌شدن = remount = حالتِ بازشده برای فیلترِ جدید از نو ساخته می‌شود. */}
              <CustomerPurchaseRows
                key={`${purchFilter}-${invPage}-${purchaseRows.length}`}
                invoices={purchaseRows}
                defaultExpanded={purchFilter === "today"}
              />

              {purchasesMeta && purchasesMeta.pageCount > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={invPage <= 1}
                    onClick={() => setInvPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronRight className="size-4" /> قبلی
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    صفحه {toFa(purchasesMeta.page)} از {toFa(purchasesMeta.pageCount)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={invPage >= purchasesMeta.pageCount}
                    onClick={() => setInvPage((p) => p + 1)}
                  >
                    بعدی <ChevronLeft className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <TakePayment
        customerId={id}
        totalDue={totalDue}
        chequeRateBp={c.chequeRateBp}
        chequeRateMode={c.chequeRateMode}
        onDone={refresh}
      />

      {/* فاکتورهای باز — همان‌هایی که این بدهی از آن‌ها آمده. */}
      {!!openInvoices.length && (
        <Card className="p-0">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">فاکتورهای باز</h2>
          </div>
          <ul className="divide-y">
            {openInvoices.map((inv) => {
              const overdue = inv.dueDate ? new Date(inv.dueDate) < new Date() : false;
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-16 shrink-0 font-medium tabular-nums">
                    #{toFa(inv.number)}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {inv.dueDate ? (
                      <>
                        سررسید{" "}
                        <span className={overdue ? "font-semibold text-destructive" : ""}>
                          {faDate(inv.dueDate)}
                        </span>
                        {overdue && " — معوق"}
                      </>
                    ) : (
                      "بدون سررسید"
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-amber-600">
                    {money(inv.dueAmount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isManager && (
        <CreditSettings customer={c} onDone={refresh} />
      )}

      {isManager && (
        <ManagerActions
          customerId={id}
          hasOpening={hasOpening}
          onDone={refresh}
        />
      )}

      {/* گردش حساب — صورتحساب با مانده‌ی متحرک، بازه و خروجی اکسل */}
      <Card className="p-0">
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">گردش حساب</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">از تاریخ</label>
                <JalaliDateInput value={stmtFrom} onChange={setStmtFrom} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">تا تاریخ</label>
                <JalaliDateInput value={stmtTo} onChange={setStmtTo} />
              </div>
              {(stmtFrom || stmtTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStmtFrom("");
                    setStmtTo("");
                  }}
                >
                  پاک‌کردن بازه
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4">
          {statement.isLoading ? (
            <LoadingState />
          ) : (
            <StatementTable
              customerId={id}
              rows={statement.data?.rows.data ?? []}
              summary={statement.data?.summary}
              range={{
                startDate: stmtFrom || undefined,
                endDate: stmtTo ? endOfDay(stmtTo) : undefined,
              }}
            />
          )}
        </div>
      </Card>

      {/* تأیید غیرفعال‌سازی — soft delete؛ سابقه‌ی فاکتورها و دفتر پاک نمی‌شود. */}
      <ConfirmDialog
        open={deactivating}
        onOpenChange={(v) => { if (!v) setDeactivating(false); }}
        title="غیرفعال‌سازی این مشتری؟"
        description={
          <>
            مشتری از فهرست انتخاب‌ها و گزارش بدهکاران حذف می‌شود؛ رکورد و
            سابقه‌ی فاکتورها و گردش حسابش پاک نمی‌شود. اگر هنوز بدهی یا
            بستانکاری داشته باشد، این کار رد می‌شود.
          </>
        }
        destructive
        confirmText="بله، غیرفعال کن"
        loading={doDeactivate.isPending}
        onConfirm={() => doDeactivate.mutate()}
      />
    </div>
  );
}


/**
 * ردیف‌های فاکتورِ مشتری با اقلام بازشونده.
 *
 * برای فیلترِ «امروز» همه‌ی ردیف‌ها از ابتدا بازند — اقلامِ خریده‌شده همان‌جا
 * دیده می‌شوند؛ برای بقیه‌ی فیلترها با کلیک باز می‌شوند. اقلام همان‌جا در
 * پاسخِ فهرست آمده‌اند (includeLines) — بدون رفت‌وبرگشتِ جدا برای هر فاکتور.
 */
function CustomerPurchaseRows({
  invoices,
  defaultExpanded,
}: {
  invoices: Invoice[];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(defaultExpanded ? invoices.map((i) => i.id) : [])
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-muted-foreground">
            <th className="p-2 text-start font-medium">شماره</th>
            <th className="p-2 text-start font-medium">تاریخ</th>
            <th className="p-2 text-start font-medium">وضعیت</th>
            <th className="w-28 p-2 text-end font-medium">مبلغ</th>
            <th className="w-28 p-2 text-end font-medium">مانده</th>
            <th className="w-12 p-2" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const cancelled = inv.status === "CANCELLED";
            const isOpen = expanded.has(inv.id);
            return (
              <React.Fragment key={inv.id}>
                <tr
                  onClick={() => toggle(inv.id)}
                  className={`cursor-pointer border-t transition-colors ${
                    cancelled ? "opacity-60" : ""
                  } ${isOpen ? "bg-muted/40" : "hover:bg-muted/30"}`}
                >
                  <td className="p-2 font-medium tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      {isOpen ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {toFa(inv.number)}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {faDate(inv.createdAt)}
                  </td>
                  <td className="p-2">
                    <StatusBadge kind="invoice" status={inv.status} />
                  </td>
                  <td className="p-2 text-end font-semibold tabular-nums">
                    {money(inv.total)}
                  </td>
                  <td className="p-2 text-end">
                    {inv.dueAmount > 0 ? (
                      <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {money(inv.dueAmount)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2 text-end">
                    {/* چاپ مجدد — باز شدنِ ردیف را باز نمی‌کند. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      title="چاپ فاکتور"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/admin/print/invoice/${inv.id}`, "_blank");
                      }}
                    >
                      <Printer className="size-3.5" />
                    </Button>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="border-t bg-muted/20">
                    <td colSpan={6} className="p-0">
                      {inv.lines?.length ? (
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40">
                            <tr className="text-muted-foreground">
                              <th className="p-2 text-start font-medium">کالا</th>
                              <th className="p-2 text-start font-medium">مکان</th>
                              <th className="w-16 p-2 text-start font-medium">تعداد</th>
                              <th className="w-28 p-2 text-end font-medium">قیمت واحد</th>
                              <th className="w-28 p-2 text-end font-medium">جمع</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.lines.map((l) => (
                              <tr key={l.id} className="border-t">
                                <td className="p-2 font-medium">
                                  {l.product?.name ?? "—"}
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">
                                  {l.location?.path ?? ""}
                                </td>
                                <td className="p-2 tabular-nums">{toFa(l.quantity)}</td>
                                <td className="p-2 tabular-nums">{money(l.unitPrice ?? 0)}</td>
                                <td className="p-2 text-end font-semibold tabular-nums">
                                  {money((l.unitPrice ?? 0) * l.quantity - (l.lineDiscount ?? 0))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="p-3 text-center text-sm text-muted-foreground">
                          این فاکتور ردیفی ندارد
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/**
 * سقف اعتبار و مهلت پیش‌فرضِ مشتری.
 *
 * تا حالا این دو فیلد در دیتابیس بودند ولی هیچ‌جای پنل قابل تنظیم نبودند —
 * یعنی هشدار اعتبار عملاً هیچ‌وقت روشن نمی‌شد و مهلت همیشه صفر می‌ماند.
 */
function CreditSettings({
  customer,
  onDone,
}: {
  customer: Customer;
  onDone: () => void;
}) {
  const [limit, setLimit] = React.useState(customer.creditLimit ?? 0);
  const [days, setDays] = React.useState(customer.creditDays ?? 0);
  /** نرخِ فروشِ مدت‌دار، به درصد در ورودی و به پایه‌ی هزارم در ذخیره. */
  const [ratePercent, setRatePercent] = React.useState(
    bpToPercent(customer.chequeRateBp ?? 0),
  );
  const [rateMode, setRateMode] = React.useState<"FLAT" | "MONTHLY">(
    customer.chequeRateMode ?? "MONTHLY",
  );

  const rateBp = percentToBp(faToEn(ratePercent));

  const save = useMutation({
    mutationFn: () =>
      updateCustomer(customer.id, {
        creditLimit: limit,
        creditDays: days,
        chequeRateBp: rateBp,
        chequeRateMode: rateMode,
      }),
    onSuccess: () => {
      toast.success("تنظیمات اعتبار ذخیره شد");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "ذخیره ناموفق بود"),
  });

  const dirty =
    limit !== (customer.creditLimit ?? 0) ||
    days !== (customer.creditDays ?? 0) ||
    rateBp !== (customer.chequeRateBp ?? 0) ||
    rateMode !== (customer.chequeRateMode ?? "MONTHLY");

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Percent className="size-4" /> اعتبار این مشتری
      </h2>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">سقف اعتبار ({unitLabel()})</label>
          <Input
            dir="ltr"
            className="h-10 w-48 text-right tabular-nums"
            value={limit ? money(limit) : ""}
            onChange={(e) => setLimit(parseNum(e.target.value))}
            placeholder="۰ = بدون سقف"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">مهلت پیش‌فرض (روز)</label>
          <Input
            dir="ltr"
            className="h-10 w-32 text-right tabular-nums"
            value={days ? toFa(days) : ""}
            onChange={(e) => setDays(parseNum(e.target.value))}
            placeholder="۰"
          />
        </div>

        {/*
          نرخِ فروشِ مدت‌دار برای چکِ این مشتری.

          به درصد گرفته می‌شود چون فروشنده «۲.۵ درصد» می‌گوید، و به پایه‌ی هزارم
          ذخیره می‌شود چون اعشار در پول یعنی اختلافِ یک‌ریالی. صفر یعنی «از
          پیش‌فرضِ فروشگاه استفاده کن».
        */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            نرخ چک (درصد)
          </label>
          <Input
            dir="ltr"
            className="h-10 w-28 text-right tabular-nums"
            inputMode="decimal"
            value={ratePercent === "0" ? "" : ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
            placeholder="۰"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">نحوه‌ی محاسبه</label>
          <div className="flex gap-1">
            {(
              [
                ["MONTHLY", "در ماه"],
                ["FLAT", "ثابت"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRateMode(mode)}
                className={`h-10 rounded-md border px-3 text-sm font-medium transition-colors ${
                  rateMode === mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:border-primary hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          ذخیره
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        سقف صفر یعنی «سقفی تعیین نشده». عبور از سقف جلوی فروش را نمی‌گیرد، فقط
        سرِ تسویه هشدار می‌دهد. نرخ چکِ صفر یعنی پیش‌فرضِ فروشگاه — و سود هیچ‌وقت
        خودکار روی فاکتور نمی‌نشیند، فروشنده سرِ هر چک تأییدش می‌کند.
      </p>
    </Card>
  );
}


function PeriodStat({
  label,
  total,
  count,
}: {
  label: string;
  total: number;
  /** تعداد فاکتور — وقتی نباشد فقط مبلغ نشان داده می‌شود. */
  count?: number;
}) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-base font-bold tabular-nums">
        {money(total)}
      </p>
      {count !== undefined && (
        <p className="text-[11px] text-muted-foreground">
          {toFa(count)} فاکتور
        </p>
      )}
    </div>
  );
}


function Stat({
  label,
  value,
  tone,
  count,
}: {
  label: string;
  value: number;
  tone?: "amber" | "red";
  count?: boolean;
}) {
  // رنگ فقط وقتی معنا دارد که عددی هست — صفرِ قرمز فقط سر و صداست.
  const color =
    value > 0 && tone === "red"
      ? "text-destructive"
      : value > 0 && tone === "amber"
        ? "text-amber-600"
        : "";

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>
        {count ? toFa(value) : money(value)}
      </p>
    </div>
  );
}


/**
 * کارهای مدیر — عمداً پایین‌تر از خلاصه و جدا از آن.
 *
 * فروشنده اینها را اصلاً نمی‌بیند؛ اصلِ «فروشنده نباید حسابداری بداند» فقط
 * وقتی کار می‌کند که ابزار حسابداری جلوی چشمش نباشد.
 */
function ManagerActions({
  customerId,
  hasOpening,
  onDone,
}: {
  customerId: string;
  hasOpening?: boolean;
  onDone: () => void;
}) {
  const [openingAmount, setOpeningAmount] = React.useState(0);
  const [adjustAmount, setAdjustAmount] = React.useState(0);
  const [reason, setReason] = React.useState("");

  const opening = useMutation({
    mutationFn: () => setOpeningBalance(customerId, openingAmount),
    onSuccess: () => {
      toast.success("مانده‌ی اول دوره ثبت شد");
      setOpeningAmount(0);
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiException ? e.message : "ثبت مانده‌ی اول دوره ناموفق بود"
      ),
  });

  const adjust = useMutation({
    mutationFn: () => adjustBalance(customerId, adjustAmount, reason),
    onSuccess: () => {
      toast.success("اصلاح حساب ثبت شد");
      setAdjustAmount(0);
      setReason("");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "اصلاح حساب ناموفق بود"),
  });

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Wallet className="size-4" /> اصلاح حساب
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        {hasOpening === false && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              مانده‌ی اول دوره
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              بدهی این مشتری از پیش از نرم‌افزار. فقط یک بار ثبت می‌شود.
            </p>
            <div className="flex gap-2">
              <Input
                dir="ltr"
                className="h-10 text-right tabular-nums"
                value={openingAmount ? money(openingAmount) : ""}
                onChange={(e) => setOpeningAmount(parseNum(e.target.value))}
                placeholder="۰"
              />
              <Button
                disabled={openingAmount <= 0 || opening.isPending}
                onClick={() => opening.mutate()}
              >
                ثبت
              </Button>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">اصلاح دستی</label>
          <p className="mb-2 text-xs text-muted-foreground">
            مثبت بدهی را زیاد و منفی کم می‌کند. ردیف قبلی پاک نمی‌شود.
          </p>
          <div className="flex gap-2">
            <Input
              dir="ltr"
              className="h-10 w-36 text-right tabular-nums"
              value={adjustAmount ? money(adjustAmount) : ""}
              onChange={(e) => setAdjustAmount(parseNum(e.target.value))}
              placeholder="۰"
            />
            <Input
              className="h-10 flex-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="دلیل (الزامی)"
            />
            <Button
              disabled={
                adjustAmount === 0 || reason.trim().length < 3 || adjust.isPending
              }
              onClick={() => adjust.mutate()}
            >
              ثبت
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
