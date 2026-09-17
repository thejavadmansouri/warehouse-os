"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Link2, Printer, Search, X } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  cancelBlankQuotation,
  getBlankQuotation,
  getBlankQuotationSuggestions,
  getBlankQuotations,
  saveBlankPrices,
  searchCustomersPaged,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import {
  amount,
  faDate,
  faTime,
  money,
  parseNum,
  qty,
  toFa,
} from "@/lib/format";
import type { BlankQuotation, Customer, LocateResult } from "@/lib/types";
import { ProductSearch } from "../../pos/_components/product-search";
import {
  BLANK_STATE_STYLE,
  blankDisplayState,
  blankNumberLabel,
  blankTotal,
  canConvert,
  convertBlockedReason,
} from "../_lib/blank-quote";

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

/**
 * تب‌ها با وضعیت‌های سرور یکی‌اند (به‌علاوه‌ی «همه»)، نه با وضعیتِ محاسبه‌شده‌ی
 * پنل: «نیمه‌کاره» یک حالت نمایشی است و فیلتر سروری ندارد.
 */
const TABS: { id: string; label: string }[] = [
  { id: "", label: "همه" },
  { id: "OPEN", label: "در انتظار قیمت" },
  { id: "PRICED", label: "قیمت‌خورده" },
  { id: "EXPIRED", label: "منقضی" },
  { id: "CONVERTED", label: "تبدیل‌شده" },
  { id: "CANCELLED", label: "لغو‌شده" },
];

/** ردیفِ قابل ویرایش — از قلمِ سرور ساخته می‌شود و تا ذخیره محلی می‌ماند. */
type EditRow = {
  lineId: string;
  text: string;
  quantity: number;
  suggestedPrice: number | null;
  finalPrice: number;
  /**
   * آیا این ردیف قیمت نهایی گرفته؟
   * ردیفِ دست‌نخورده نباید `finalPrice` بفرستد، وگرنه یک صفرِ بی‌قصد
   * «قیمت‌خورده» ثبت می‌شود و برگه بی‌آنکه کسی قیمت داده باشد آماده‌ی تبدیل می‌شود.
   */
  priced: boolean;
  productId: string | null;
  productName: string | null;
  locationId: string | null;
  locationPath: string | null;
};

function toRows(q: BlankQuotation): EditRow[] {
  return q.lines.map((l) => ({
    lineId: l.id,
    text: l.text,
    quantity: l.quantity,
    suggestedPrice: l.suggestedPrice,
    finalPrice: l.finalPrice ?? 0,
    priced: l.pricedAt !== null,
    productId: l.product?.id ?? null,
    productName: l.product?.name ?? null,
    locationId: l.locationId,
    locationPath: l.locationPath,
  }));
}

function moveBlankCell(
  e: React.KeyboardEvent<HTMLElement>,
  row: number,
  column: number,
  rowCount: number,
) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
    return;

  const nextRow =
    e.key === "ArrowUp" ? row - 1 : e.key === "ArrowDown" ? row + 1 : row;
  const nextColumn =
    e.key === "ArrowLeft"
      ? column + 1
      : e.key === "ArrowRight"
        ? column - 1
        : column;
  if (nextRow < 0 || nextRow >= rowCount || nextColumn < 0 || nextColumn > 3)
    return;

  const next = document.querySelector<HTMLElement>(
    `[data-blank-cell="${nextRow}:${nextColumn}"]`,
  );
  if (!next) return;
  e.preventDefault();
  e.stopPropagation();
  next.focus();
  if (next instanceof HTMLInputElement) next.select();
}

/**
 * پیش‌فاکتور سفید — نیمه‌ی مدیر.
 *
 * برگه‌ها از گوشی می‌آیند و اقلامشان متنِ آزاد است («لنت پراید جلو»)؛ اینجا
 * مدیر قیمت می‌گذارد و قلم را به کالای واقعی وصل می‌کند. تا وقتی هر دو کار
 * تمام نشده، دکمه‌ی تبدیل خاموش است — چون تبدیل، لحظه‌ای است که موجودی کم
 * می‌شود و برگه‌ی نیمه‌کاره نباید به آن نقطه برسد.
 */
export function BlankQuotationsPanel({
  open = true,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [tab, setTab] = React.useState("");
  const [listRow, setListRow] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<EditRow[]>([]);
  const [pickFor, setPickFor] = React.useState<number | null>(null);

  const list = useQuery({
    queryKey: ["blank-quotations", tab],
    queryFn: () => getBlankQuotations({ status: tab || undefined, limit: 50 }),
  });

  const detail = useQuery({
    queryKey: ["blank-quotation", openId],
    queryFn: () => getBlankQuotation(openId!),
    enabled: !!openId,
  });

  /**
   * پیشنهاد کالا برای ردیف‌های متنی.
   *
   * فقط وقتی گرفته می‌شود که برگه‌ای باز باشد — تصمیمِ نیمه‌خودکار (سیستم
   * پیشنهاد می‌دهد، مدیر وصل می‌کند) بدون این لیست یعنی مدیر باید متنِ کارگر
   * را دستی دوباره در جست‌وجوی کالا تایپ کند.
   */
  const suggestions = useQuery({
    queryKey: ["blank-quotation-suggestions", openId],
    queryFn: () => getBlankQuotationSuggestions(openId!),
    enabled: !!openId,
  });

  // قلم‌ها با آخرین داده‌ی سرور هم‌گام می‌شوند (بعد از ذخیره یا ورود به برگه‌ی دیگر).
  // Server refreshes replace the editable draft; this is intentionally state synchronization.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detail.data) setRows(toRows(detail.data));
  }, [detail.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["blank-quotations"] });
    qc.invalidateQueries({ queryKey: ["blank-quotation"] });
    qc.invalidateQueries({ queryKey: ["blank-quotation-suggestions"] });
  };

  const patch = (i: number, p: Partial<EditRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));

  /*
   * اتصال نامِ مشتری به پرونده — اختیاری و مستقل از ذخیره‌ی قیمت‌ها.
   * هر تغییر فوری ذخیره می‌شود تا چاپِ برگه همیشه آخرین وضعیت را داشته باشد.
   */
  const linkCustomer = useMutation({
    mutationFn: (customerId: string | null) =>
      saveBlankPrices(openId!, {
        customerId,
        lines: [{ lineId: rows[0]?.lineId ?? "" }],
      }),
    onSuccess: () => {
      toast.success("اتصال مشتری ذخیره شد");
      refresh();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      toast.error(err?.message ?? "ذخیره‌ی اتصال مشتری ناموفق بود");
    },
  });

  const [customerQuery, setCustomerQuery] = React.useState("");
  const customerHits = useQuery({
    queryKey: ["blank-customer-search", customerQuery],
    queryFn: () => searchCustomersPaged({ q: customerQuery, pageSize: 6 }),
    enabled: !!openId && customerQuery.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: () =>
      saveBlankPrices(openId!, {
        lines: rows.map((r) => ({
          lineId: r.lineId,
          // فقط ردیفی که قیمت گرفته قیمت می‌فرستد؛ بقیه دست‌نخورده می‌مانند.
          ...(r.priced ? { finalPrice: r.finalPrice } : {}),
          ...(r.text.trim() ? { text: r.text.trim() } : {}),
          productId: r.productId,
          locationId: r.productId ? r.locationId : null,
        })),
      }),
    onSuccess: (q) => {
      toast.success(
        q.unpricedCount === 0 && q.unlinkedCount === 0
          ? "برگه کامل شد — آماده‌ی تبدیل است"
          : `${toFa(q.unpricedCount)} قلم هنوز قیمت نخورده، ${toFa(q.unlinkedCount)} قلم وصل نشده`,
      );
      refresh();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      if (err?.code === "ALREADY_CONVERTED") {
        toast.error("این برگه تبدیل شده و دیگر ویرایش نمی‌شود");
      } else {
        toast.error(err?.message ?? "ذخیره‌ی قیمت‌ها ناموفق بود");
      }
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelBlankQuotation(id),
    onSuccess: () => {
      toast.success("برگه لغو شد");
      setOpenId(null);
      refresh();
    },
    onError: () => toast.error("لغو ناموفق بود"),
  });

  const q = detail.data;
  const listRows = list.data?.data ?? [];

  React.useEffect(() => {
    if (open && onClose) rootRef.current?.focus();
  }, [open, onClose]);

  if (!open) return null;
  const state = q ? blankDisplayState(q) : null;
  const blocked = q ? convertBlockedReason(q) : null;

  /** جمعِ همان چیزی که روی صفحه است، نه جمعِ ذخیره‌شده در سرور. */
  const editingTotal = rows.reduce(
    (s, r) => s + r.quantity * (r.priced ? r.finalPrice : 0),
    0,
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={
        onClose
          ? "fixed inset-0 z-50 flex min-h-0 flex-col bg-background outline-none"
          : "flex min-h-0 flex-1 flex-col outline-none"
      }
      onKeyDown={(e) => {
        if (openId) return;
        if (e.key === "Escape") {
          e.preventDefault();
          onClose?.();
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setListRow((row) =>
            e.key === "ArrowDown"
              ? Math.min(row + 1, Math.max(listRows.length - 1, 0))
              : Math.max(row - 1, 0),
          );
          return;
        }
        if (e.key === "Enter" && listRows[listRow]) {
          e.preventDefault();
          setOpenId(listRows[listRow].id);
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowRight className="size-4" />
            بازگشت به صندوق
          </Button>
        )}
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          aria-label="وضعیت برگه‌ی سفید"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {TABS.map((t) => (
            <option key={t.id || "all"} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {toFa(listRows.length)} برگه‌ی سفید — ساخته‌ی گوشی
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !listRows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            برگه‌ای در این وضعیت نیست. کارگر از گوشی، «پیش‌فاکتور سفید» را
            می‌سازد و همین‌جا ظاهر می‌شود.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-24`}>شماره</th>
                <th className={`${TH} w-24`}>تاریخ</th>
                <th className={`${TH} w-16`}>ساعت</th>
                <th className={TH}>مشتری</th>
                <th className={`${TH} w-24`}>فروشنده</th>
                <th className={`${TH} w-28`}>اقلام</th>
                <th className={`${TH} w-28`}>وضعیت</th>
                <th className={`${TH} w-32`}>مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {listRows.map((r, i) => {
                const st = BLANK_STATE_STYLE[blankDisplayState(r)];
                const total = blankTotal(r);
                return (
                  <tr
                    key={r.id}
                    data-active-row={i === listRow}
                    onMouseEnter={() => setListRow(i)}
                    onClick={() => setOpenId(r.id)}
                    className="cursor-pointer border-b odd:bg-muted/25"
                  >
                    <td className={`${TD} font-bold tabular-nums`}>
                      {blankNumberLabel(r.number)}
                    </td>
                    <td className={`${TD} tabular-nums text-muted-foreground`}>
                      {faDate(r.createdAt)}
                    </td>
                    <td className={`${TD} tabular-nums text-muted-foreground`}>
                      {faTime(r.createdAt)}
                    </td>
                    <td className={`${TD} max-w-0 truncate`}>
                      {r.customerName ?? "بدون نام"}
                    </td>
                    <td
                      className={`${TD} max-w-0 truncate text-muted-foreground`}
                    >
                      {r.user?.fullName ?? "—"}
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {toFa(r.lineCount)} قلم
                      {/* «چند تا مانده» مهم‌تر از کل است — همان چیزی که کار دارد. */}
                      {r.unpricedCount > 0 && (
                        <span className="text-amber-700">
                          {" "}
                          — {toFa(r.unpricedCount)} بی‌قیمت
                        </span>
                      )}
                      {r.unlinkedCount > 0 && (
                        <span className="text-amber-700">
                          {" "}
                          — {toFa(r.unlinkedCount)} وصل نشده
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <Badge variant="outline" className={st.className}>
                        {st.label}
                      </Badge>
                    </td>
                    <td className={`${TD} text-end font-bold tabular-nums`}>
                      {/* تا وقتی قلمِ بی‌قیمت هست، جمعِ قطعی وجود ندارد. */}
                      {total === null ? "—" : money(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openId && (
        <div
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background outline-none"
          onKeyDown={(e) => {
            if (e.key === "Escape" && pickFor === null) {
              e.preventDefault();
              e.stopPropagation();
              setOpenId(null);
            }
          }}
        >
          <div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 shadow-sm">
            <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
              <ArrowRight className="size-4" />
              بازگشت
            </Button>
            <div className="min-w-0 flex items-center gap-2">
              <h2 className="truncate font-semibold">
                {q ? blankNumberLabel(q.number) : "برگه‌ی سفید"}
              </h2>
              {state && (
                <Badge
                  variant="outline"
                  className={BLANK_STATE_STYLE[state].className}
                >
                  {BLANK_STATE_STYLE[state].label}
                </Badge>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            {detail.isLoading || !q ? (
              <LoadingState />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>{q.customerName ?? "بدون نام مشتری"}</span>
                  {q.customer ? (
                    <a
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
                      href={`/admin/customers/${q.customer.id}`}
                      title="مشاهده پرونده مشتری"
                    >
                      <Link2 className="size-3" />
                      متصل به {q.customer.fullName}
                    </a>
                  ) : null}
                  <span className="text-muted-foreground">
                    {faDate(q.createdAt)} — {q.user?.fullName ?? "نامشخص"}
                  </span>
                  {q.validUntil && (
                    <span className="text-muted-foreground">
                      اعتبار تا {faDate(q.validUntil)}
                    </span>
                  )}
                  {q.convertedInvoiceId && (
                    <a
                      className="text-primary underline"
                      href={`/admin/invoices/${q.convertedInvoiceId}`}
                    >
                      فاکتور تبدیل‌شده
                    </a>
                  )}
                </div>

                {/*
                اتصال نام به پرونده‌ی مشتری — اختیاری. متنِ آزاد می‌ماند؛ این
                فقط وقتی فاکتور نهایی می‌سازد به مشتریِ واقعی می‌بندد و در چاپ
                صورت‌حساب هم پرونده دیده می‌شود.
              */}
                {q.status !== "CONVERTED" && q.status !== "CANCELLED" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
                    <span className="text-muted-foreground">
                      اتصال به پرونده:
                    </span>
                    {q.customer ? (
                      <>
                        <span className="font-medium">
                          {q.customer.fullName}
                        </span>
                        <button
                          type="button"
                          className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={() => linkCustomer.mutate(null)}
                          disabled={linkCustomer.isPending}
                        >
                          برداشتن اتصال
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          dir="rtl"
                          className="h-8 w-56"
                          placeholder="نام مشتری برای جست‌وجو…"
                          value={customerQuery}
                          onChange={(e) => setCustomerQuery(e.target.value)}
                        />
                        {customerQuery.trim().length >= 2 &&
                          (customerHits.isFetching ? (
                            <span className="text-xs text-muted-foreground">
                              در حال جست‌وجو…
                            </span>
                          ) : (customerHits.data?.data ?? []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(customerHits.data?.data ?? [])
                                .slice(0, 6)
                                .map((c: Customer) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="rounded-full border border-dashed px-2 py-0.5 text-[11px] hover:bg-muted"
                                    onClick={() => {
                                      linkCustomer.mutate(c.id);
                                      setCustomerQuery("");
                                    }}
                                  >
                                    <Link2 className="me-1 inline size-3" />
                                    {c.fullName}
                                  </button>
                                ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              مشتری‌ای پیدا نشد
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* قیمت‌گذاری — اقلام همان متنِ گفته‌شده روی گوشی هستند. */}
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-40">نام گفته‌شده</TableHead>
                        <TableHead className="w-20 text-center">
                          تعداد
                        </TableHead>
                        <TableHead className="w-32">
                          قیمت پیشنهادی گوشی
                        </TableHead>
                        <TableHead className="w-36">قیمت نهایی</TableHead>
                        <TableHead className="min-w-44">کالای واقعی</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => {
                        const sug = suggestions.data?.find(
                          (s) => s.lineId === r.lineId,
                        );
                        return (
                          <TableRow key={r.lineId}>
                            <TableCell>
                              <Input
                                dir="rtl"
                                className="h-8 w-full text-sm font-medium"
                                value={r.text}
                                onKeyDown={(e) =>
                                  moveBlankCell(e, i, 0, rows.length)
                                }
                                data-blank-cell={`${i}:0`}
                                onChange={(e) =>
                                  patch(i, { text: e.target.value })
                                }
                              />
                              {/* پیشنهادها زیر همان قلم می‌آیند تا وصل‌کردن یک کلیک باشد. */}
                              {!r.productId && !!sug?.candidates.length && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {sug.candidates.map((c) => (
                                    <button
                                      key={c.productId}
                                      type="button"
                                      className="rounded-full border border-dashed px-2 py-0.5 text-[11px] hover:bg-muted"
                                      onClick={() =>
                                        patch(i, {
                                          productId: c.productId,
                                          productName: c.name,
                                          locationId: c.locationId,
                                          locationPath: c.locationPath,
                                        })
                                      }
                                    >
                                      <Link2 className="me-1 inline size-3" />
                                      {c.name}
                                      {c.totalStock > 0 && (
                                        <span className="text-muted-foreground">
                                          {" "}
                                          ({toFa(c.totalStock)})
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                dir="ltr"
                                className="h-8 w-16 text-right tabular-nums"
                                value={qty(r.quantity)}
                                onKeyDown={(e) =>
                                  moveBlankCell(e, i, 1, rows.length)
                                }
                                data-blank-cell={`${i}:1`}
                                onChange={(e) =>
                                  patch(i, {
                                    quantity: parseNum(e.target.value),
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">
                              {/* پیشنهاد گوشی فقط راهنماست و در هیچ جمعی نمی‌آید. */}
                              {r.suggestedPrice === null
                                ? "—"
                                : money(r.suggestedPrice)}
                            </TableCell>
                            <TableCell>
                              <MoneyInput
                                className="h-8 w-32 text-right text-sm tabular-nums"
                                value={r.priced ? r.finalPrice : 0}
                                onKeyDown={(e) =>
                                  moveBlankCell(e, i, 2, rows.length)
                                }
                                data-blank-cell={`${i}:2`}
                                onChange={(n) =>
                                  patch(i, { finalPrice: n, priced: true })
                                }
                              />
                              {!r.priced && (
                                <span className="text-[11px] text-amber-700">
                                  قیمت نخورده
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {r.productId ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <span className="max-w-32 truncate">
                                    {r.productName}
                                  </span>
                                  {r.locationPath && (
                                    <span className="text-muted-foreground">
                                      ({r.locationPath})
                                    </span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="برداشتن پیوند"
                                    data-blank-cell={`${i}:3`}
                                    onKeyDown={(e) =>
                                      moveBlankCell(e, i, 3, rows.length)
                                    }
                                    onClick={() =>
                                      patch(i, {
                                        productId: null,
                                        productName: null,
                                        locationId: null,
                                        locationPath: null,
                                      })
                                    }
                                  >
                                    <X className="size-3.5 text-destructive" />
                                  </Button>
                                </span>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onKeyDown={(e) =>
                                    moveBlankCell(e, i, 3, rows.length)
                                  }
                                  data-blank-cell={`${i}:3`}
                                  onClick={() => setPickFor(i)}
                                >
                                  <Search className="size-3.5" /> وصل به کالا
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                  <span className="font-semibold">
                    جمع قیمت‌های خورده
                    {rows.some((r) => !r.priced) && (
                      <span className="ms-2 text-xs font-normal text-amber-700">
                        (با ردیف‌های بی‌قیمت کامل نمی‌شود)
                      </span>
                    )}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {amount(Math.max(0, editingTotal))}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="flex-1"
                    disabled={save.isPending || !rows.length}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? "در حال ذخیره…" : "ذخیره‌ی قیمت‌ها"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        `/admin/print/blank-quotation/${q.id}`,
                        "_blank",
                      )
                    }
                  >
                    <Printer className="size-4" /> چاپ برگه
                  </Button>

                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={cancel.isPending || q.status === "CONVERTED"}
                    onClick={() => cancel.mutate(q.id)}
                  >
                    لغو برگه
                  </Button>
                </div>

                {/*
                تبدیل — با دلیلِ خاموشی. دکمه‌ی خاموشِ بی‌توضیح یعنی مدیر نمی‌فهمد
                چه چیزی کم است و برمی‌گردد سراغ گوشی.
              */}
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Button
                      className="flex-1"
                      disabled={
                        blocked !== null ||
                        save.isPending ||
                        // تغییر ذخیره‌نشده روی صفحه یعنی آنچه تبدیل می‌شود این نیست.
                        JSON.stringify(rows) !==
                          JSON.stringify(q ? toRows(q) : [])
                      }
                      onClick={() => {
                        // تبدیل از همان جریان POS انجام می‌شود تا مشتری، سپس پرداخت،
                        // با همان کیبورد و همان فلوِ فروش انجام شود.
                        window.location.assign(
                          `/admin/pos?blankQuotation=${encodeURIComponent(q.id)}`,
                        );
                      }}
                    >
                      تبدیل به فاکتور در صندوق
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {blocked ??
                      "همه‌ی اقلام قیمت خورده و وصل شده‌اند — تبدیل، موجودی را کم می‌کند."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ProductSearch
        open={pickFor !== null}
        initialQuery={
          pickFor === null
            ? ""
            : (rows[pickFor]?.productName ?? rows[pickFor]?.text ?? "")
        }
        onPick={(r: LocateResult) => {
          if (pickFor === null) return;
          const top = r.locations?.find((l) => l.quantity > 0) ?? null;
          patch(pickFor, {
            productId: r.id,
            productName: r.name,
            locationId: top?.locationId ?? null,
            locationPath: top?.path ?? null,
            // اگر مدیر کالای واقعی را وصل کرد و قیمت نداده، قیمت فروش کالا راهنماست.
            ...(rows[pickFor]?.priced
              ? {}
              : { finalPrice: r.salePrice ?? rows[pickFor]!.finalPrice }),
          });
          setPickFor(null);
        }}
        onSendToWorker={() => {}}
        onClose={() => setPickFor(null)}
      />
    </div>
  );
}
