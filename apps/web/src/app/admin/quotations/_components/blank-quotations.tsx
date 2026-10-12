"use client";

/**
 * فاکتور سفید — فهرست + ویرایش + ساخت از پنل.
 *
 * برگه از گوشی یا از همین صفحه می‌آید؛ مدیر قیمت می‌گذارد، قلم را به کالا
 * وصل می‌کند، قلم اضافه/حذف می‌کند، و وقتی آماده بود به صندوق می‌فرستد.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  FilePlus2,
  Link2,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  cancelBlankQuotation,
  createBlankQuotation,
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
import { uuid } from "@/lib/uuid";
import { cn } from "@/lib/utils";
import type { BlankQuotation, Customer, LocateResult } from "@/lib/types";
import { ProductSearch } from "../../pos/_components/product-search";
import {
  BLANK_STATE_STYLE,
  blankDisplayState,
  blankNumberLabel,
  blankTotal,
  convertBlockedReason,
} from "../_lib/blank-quote";

const TABS: { id: string; label: string }[] = [
  { id: "", label: "همه" },
  { id: "OPEN", label: "در انتظار قیمت" },
  { id: "PRICED", label: "قیمت‌خورده" },
  { id: "EXPIRED", label: "منقضی" },
  { id: "CONVERTED", label: "تبدیل‌شده" },
  { id: "CANCELLED", label: "لغو‌شده" },
];

type EditRow = {
  lineId: string;
  text: string;
  quantity: number;
  suggestedPrice: number | null;
  finalPrice: number;
  priced: boolean;
  productId: string | null;
  productName: string | null;
  locationId: string | null;
  locationPath: string | null;
  /** قلم تازهٔ ذخیره‌نشده روی سرور. */
  isNew?: boolean;
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

function newDraftLine(): EditRow {
  return {
    lineId: `new-${uuid()}`,
    text: "",
    quantity: 1,
    suggestedPrice: null,
    finalPrice: 0,
    priced: false,
    productId: null,
    productName: null,
    locationId: null,
    locationPath: null,
    isNew: true,
  };
}

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
  const [removedIds, setRemovedIds] = React.useState<string[]>([]);
  const [pickFor, setPickFor] = React.useState<number | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createNote, setCreateNote] = React.useState("");
  const [createLines, setCreateLines] = React.useState([
    { text: "", quantity: 1 },
  ]);

  const list = useQuery({
    queryKey: ["blank-quotations", tab],
    queryFn: () => getBlankQuotations({ status: tab || undefined, limit: 50 }),
  });

  const detail = useQuery({
    queryKey: ["blank-quotation", openId],
    queryFn: () => getBlankQuotation(openId!),
    enabled: !!openId,
  });

  const suggestions = useQuery({
    queryKey: ["blank-quotation-suggestions", openId],
    queryFn: () => getBlankQuotationSuggestions(openId!),
    enabled: !!openId,
  });

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detail.data) {
      setRows(toRows(detail.data));
      setRemovedIds([]);
    }
  }, [detail.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["blank-quotations"] });
    void qc.invalidateQueries({ queryKey: ["blank-quotation"] });
    void qc.invalidateQueries({ queryKey: ["blank-quotation-suggestions"] });
  };

  const patch = (i: number, p: Partial<EditRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const linkCustomer = useMutation({
    mutationFn: (customerId: string | null) =>
      saveBlankPrices(openId!, {
        customerId,
        lines: rows.filter((r) => !r.isNew).slice(0, 1).map((r) => ({ lineId: r.lineId })),
      }),
    onSuccess: () => {
      toast.success("اتصال مشتری ذخیره شد");
      refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiException ? e.message : "ذخیره‌ی اتصال مشتری ناموفق بود");
    },
  });

  const [customerQuery, setCustomerQuery] = React.useState("");
  const customerHits = useQuery({
    queryKey: ["blank-customer-search", customerQuery],
    queryFn: () => searchCustomersPaged({ q: customerQuery, pageSize: 6 }),
    enabled: !!openId && customerQuery.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: () => {
      const existing = rows.filter((r) => !r.isNew);
      const added = rows.filter((r) => r.isNew && r.text.trim().length >= 1);
      return saveBlankPrices(openId!, {
        removeLineIds: removedIds.length ? removedIds : undefined,
        addLines: added.length
          ? added.map((r) => ({
              text: r.text.trim(),
              quantity: Math.max(1, r.quantity || 1),
              ...(r.suggestedPrice != null ? { suggestedPrice: r.suggestedPrice } : {}),
            }))
          : undefined,
        lines: existing.map((r) => ({
          lineId: r.lineId,
          quantity: Math.max(1, r.quantity || 1),
          ...(r.priced ? { finalPrice: r.finalPrice } : {}),
          ...(r.text.trim() ? { text: r.text.trim() } : {}),
          productId: r.productId,
          locationId: r.productId ? r.locationId : null,
        })),
      });
    },
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
      toast.error(
        err?.code === "ALREADY_CONVERTED"
          ? "این برگه تبدیل شده و دیگر ویرایش نمی‌شود"
          : (err?.message ?? "ذخیره ناموفق بود"),
      );
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

  const createM = useMutation({
    mutationFn: () => {
      const lines = createLines
        .map((l) => ({ text: l.text.trim(), quantity: Math.max(1, l.quantity || 1) }))
        .filter((l) => l.text.length >= 1);
      if (!lines.length) {
        return Promise.reject(new Error("حداقل یک قلم با متن لازم است"));
      }
      return createBlankQuotation({
        clientRequestId: uuid(),
        customerName: createName.trim() || undefined,
        note: createNote.trim() || undefined,
        lines,
      });
    },
    onSuccess: (q) => {
      toast.success(`فاکتور سفید ${blankNumberLabel(q.number)} ساخته شد`);
      setCreating(false);
      setCreateName("");
      setCreateNote("");
      setCreateLines([{ text: "", quantity: 1 }]);
      refresh();
      setOpenId(q.id);
    },
    onError: (e: unknown) => {
      toast.error(
        e instanceof Error && !(e instanceof ApiException)
          ? e.message
          : e instanceof ApiException
            ? e.message
            : "ساخت برگه ناموفق بود",
      );
    },
  });

  const q = detail.data;
  const listRows = list.data?.data ?? [];

  React.useEffect(() => {
    if (open && onClose) rootRef.current?.focus();
  }, [open, onClose]);

  if (!open) return null;
  const state = q ? blankDisplayState(q) : null;
  const blocked = q ? convertBlockedReason(q) : null;
  const editingTotal = rows.reduce(
    (s, r) => s + r.quantity * (r.priced ? r.finalPrice : 0),
    0,
  );
  const dirty =
    !!q &&
    (removedIds.length > 0 ||
      rows.some((r) => r.isNew) ||
      JSON.stringify(rows.filter((r) => !r.isNew)) !==
        JSON.stringify(toRows(q)));

  const editable = q && q.status !== "CONVERTED" && q.status !== "CANCELLED";

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
        if (openId || creating) return;
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
          setOpenId(listRows[listRow]!.id);
        }
      }}
    >
      {/* نوار بالا — solid */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowRight className="size-4" />
            بازگشت به صندوق
          </Button>
        ) : null}
        <h1 className="text-sm font-bold">فاکتور سفید</h1>
        <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id || "all"}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                tab === t.id
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {toFa(listRows.length)} برگه
        </span>
        <Button
          size="sm"
          className="ms-auto"
          onClick={() => setCreating(true)}
        >
          <FilePlus2 className="me-1.5 size-3.5" />
          فاکتور سفید جدید
        </Button>
      </div>

      {/* فهرست */}
      <div className="min-h-0 flex-1 overflow-auto">
        {list.isLoading ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !listRows.length ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <FilePlus2 className="size-7 text-muted-foreground" />
            </div>
            <p className="text-base font-medium">هنوز فاکتور سفیدی نیست</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              از گوشی بفرستید یا همین‌جا بسازید — بعد قیمت بگذارید و به کالا وصل کنید.
            </p>
            <Button onClick={() => setCreating(true)}>
              <Plus className="me-1.5 size-4" />
              ساخت از سیستم
            </Button>
          </div>
        ) : (
          <table className="pos-lines w-full min-w-[720px] table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="text-muted-foreground">
                <th className="w-24 px-2 py-2 text-start text-xs font-medium">شماره</th>
                <th className="w-28 px-2 py-2 text-start text-xs font-medium">تاریخ</th>
                <th className="px-2 py-2 text-start text-xs font-medium">مشتری</th>
                <th className="w-28 px-2 py-2 text-start text-xs font-medium">ثبت‌کننده</th>
                <th className="w-36 px-2 py-2 text-start text-xs font-medium">اقلام</th>
                <th className="w-28 px-2 py-2 text-start text-xs font-medium">وضعیت</th>
                <th className="w-32 px-2 py-2 text-end text-xs font-medium">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {listRows.map((r, i) => {
                const st = BLANK_STATE_STYLE[blankDisplayState(r)];
                const total = blankTotal(r);
                return (
                  <tr
                    key={r.id}
                    onMouseEnter={() => setListRow(i)}
                    onClick={() => setOpenId(r.id)}
                    className={cn(
                      "cursor-pointer border-t border-e-2 transition-colors",
                      i === listRow
                        ? "border-e-primary bg-primary/[0.04]"
                        : "border-e-transparent hover:bg-muted/40",
                    )}
                  >
                    <td className="px-2 py-2 font-bold tabular-nums">
                      {blankNumberLabel(r.number)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">
                      {faDate(r.createdAt)}
                      <span className="ms-1 text-[11px]">{faTime(r.createdAt)}</span>
                    </td>
                    <td className="truncate px-2 py-2">
                      {r.customerName ?? r.customer?.fullName ?? "بدون نام"}
                    </td>
                    <td className="truncate px-2 py-2 text-muted-foreground">
                      {r.user?.fullName ?? "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {toFa(r.lineCount)} قلم
                      {r.unpricedCount > 0 ? (
                        <span className="text-amber-700">
                          {" "}
                          · {toFa(r.unpricedCount)} بی‌قیمت
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={st.className}>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-end font-bold tabular-nums">
                      {total === null ? "—" : money(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* جزئیات برگه */}
      {openId ? (
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
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
            <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
              <ArrowRight className="size-4" />
              فهرست
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-base font-bold">
                {q ? blankNumberLabel(q.number) : "فاکتور سفید"}
              </h2>
              {state ? (
                <Badge variant="outline" className={BLANK_STATE_STYLE[state].className}>
                  {BLANK_STATE_STYLE[state].label}
                </Badge>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {q?.user?.fullName ?? "—"} · {q ? faDate(q.createdAt) : ""}
            </span>
            <div className="ms-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/admin/print/blank-quotation/${openId}`, "_blank")
                }
              >
                <Printer className="size-3.5" />
                چاپ
              </Button>
              {editable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(openId)}
                >
                  لغو برگه
                </Button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
            {detail.isLoading || !q ? (
              <LoadingState />
            ) : (
              <div className="mx-auto flex max-w-5xl flex-col gap-4">
                {/* مشتری */}
                <div className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {q.customerName ?? "بدون نام مشتری"}
                    </span>
                    {q.customer ? (
                      <a
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
                        href={`/admin/customers/${q.customer.id}`}
                      >
                        <Link2 className="size-3" />
                        {q.customer.fullName}
                      </a>
                    ) : null}
                    {q.convertedInvoiceId ? (
                      <a
                        className="text-xs text-primary underline"
                        href={`/admin/invoices/${q.convertedInvoiceId}`}
                      >
                        فاکتور تبدیل‌شده
                      </a>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">اتصال به پرونده:</span>
                      {q.customer ? (
                        <button
                          type="button"
                          className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={() => linkCustomer.mutate(null)}
                          disabled={linkCustomer.isPending}
                        >
                          برداشتن اتصال
                        </button>
                      ) : (
                        <>
                          <Input
                            className="h-8 w-52"
                            placeholder="جست‌وجوی مشتری…"
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                          />
                          {(customerHits.data?.data ?? []).slice(0, 5).map((c: Customer) => (
                            <button
                              key={c.id}
                              type="button"
                              className="rounded-full border border-dashed px-2 py-0.5 text-[11px] hover:bg-muted"
                              onClick={() => {
                                linkCustomer.mutate(c.id);
                                setCustomerQuery("");
                              }}
                            >
                              {c.fullName}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* اقلام */}
                <div className="overflow-hidden rounded-lg border">
                  <table className="pos-lines w-full text-sm">
                    <thead className="bg-muted/70">
                      <tr className="text-muted-foreground">
                        <th className="px-2 py-2 text-start text-xs font-medium">شرح</th>
                        <th className="w-20 px-2 py-2 text-center text-xs font-medium">تعداد</th>
                        <th className="w-28 px-2 py-2 text-start text-xs font-medium">پیشنهاد گوشی</th>
                        <th className="w-32 px-2 py-2 text-start text-xs font-medium">قیمت نهایی</th>
                        <th className="min-w-[10rem] px-2 py-2 text-start text-xs font-medium">
                          کالای واقعی
                        </th>
                        <th className="w-10 px-1 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const sug = suggestions.data?.find((s) => s.lineId === r.lineId);
                        return (
                          <tr key={r.lineId} className="border-t align-top">
                            <td className="px-2 py-1.5">
                              <Input
                                className="h-8 text-sm font-medium"
                                value={r.text}
                                disabled={!editable}
                                onChange={(e) => patch(i, { text: e.target.value })}
                              />
                              {!r.productId && !!sug?.candidates.length ? (
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
                                          ...(!r.priced && c.salePrice != null
                                            ? { finalPrice: c.salePrice, priced: true }
                                            : {}),
                                        })
                                      }
                                    >
                                      <Link2 className="me-1 inline size-3" />
                                      {c.name}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                dir="ltr"
                                className="h-8 text-center tabular-nums"
                                value={qty(r.quantity)}
                                disabled={!editable}
                                onChange={(e) =>
                                  patch(i, { quantity: Math.max(1, parseNum(e.target.value) || 1) })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5 text-xs tabular-nums text-muted-foreground">
                              {r.suggestedPrice == null ? "—" : money(r.suggestedPrice)}
                            </td>
                            <td className="px-2 py-1.5">
                              <MoneyInput
                                className="h-8"
                                value={r.priced ? r.finalPrice : 0}
                                disabled={!editable}
                                onChange={(n) => patch(i, { finalPrice: n, priced: true })}
                              />
                              {!r.priced ? (
                                <span className="text-[11px] text-amber-700">قیمت نخورده</span>
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              {r.productId ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <span className="max-w-[9rem] truncate font-medium">
                                    {r.productName}
                                  </span>
                                  {editable ? (
                                    <button
                                      type="button"
                                      className="text-destructive"
                                      onClick={() =>
                                        patch(i, {
                                          productId: null,
                                          productName: null,
                                          locationId: null,
                                          locationPath: null,
                                        })
                                      }
                                    >
                                      <X className="size-3.5" />
                                    </button>
                                  ) : null}
                                </span>
                              ) : editable ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setPickFor(i)}
                                >
                                  <Search className="size-3.5" />
                                  وصل به کالا
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-1 py-1.5">
                              {editable ? (
                                <button
                                  type="button"
                                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label="حذف قلم"
                                  onClick={() => {
                                    if (r.isNew) {
                                      setRows((prev) => prev.filter((_, j) => j !== i));
                                    } else {
                                      setRemovedIds((prev) => [...prev, r.lineId]);
                                      setRows((prev) => prev.filter((_, j) => j !== i));
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {editable ? (
                    <div className="border-t bg-muted/30 px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRows((prev) => [...prev, newDraftLine()])}
                      >
                        <Plus className="me-1 size-3.5" />
                        افزودن قلم
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* نوار پایین sticky */}
          {q && editable ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3">
              <div>
                <div className="text-[10px] text-muted-foreground">جمع قیمت‌های خورده</div>
                <div className="text-xl font-bold tabular-nums">
                  {amount(Math.max(0, editingTotal))}
                </div>
                {blocked ? (
                  <p className="text-xs text-amber-700">{blocked}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    آماده‌ی تبدیل — موجودی با تبدیل کم می‌شود
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={save.isPending || (!dirty && !rows.length)}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "…" : "ذخیره تغییرات"}
                </Button>
                <Button
                  disabled={blocked !== null || save.isPending || dirty}
                  onClick={() => {
                    window.location.assign(
                      `/admin/pos?blankQuotation=${encodeURIComponent(q.id)}`,
                    );
                  }}
                >
                  تبدیل در صندوق
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ساخت جدید */}
      <Dialog open={creating} onOpenChange={(v) => !createM.isPending && setCreating(v)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>فاکتور سفید جدید</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">نام مشتری</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="اختیاری"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">اقلام</label>
              <div className="space-y-2">
                {createLines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={l.text}
                      placeholder="نام کالا / شرح…"
                      onChange={(e) =>
                        setCreateLines((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      dir="ltr"
                      className="w-20 text-center"
                      value={toFa(l.quantity)}
                      onChange={(e) =>
                        setCreateLines((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? { ...x, quantity: Math.max(1, parseNum(e.target.value) || 1) }
                              : x,
                          ),
                        )
                      }
                    />
                    {createLines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setCreateLines((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setCreateLines((prev) => [...prev, { text: "", quantity: 1 }])
                }
              >
                <Plus className="me-1 size-3.5" />
                قلم دیگر
              </Button>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">یادداشت</label>
              <Input
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                placeholder="اختیاری"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreating(false)}
              disabled={createM.isPending}
            >
              انصراف
            </Button>
            <Button
              disabled={createM.isPending}
              onClick={() => createM.mutate()}
            >
              {createM.isPending ? "…" : "ثبت برگه"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            ...(rows[pickFor]?.priced
              ? {}
              : {
                  finalPrice: r.salePrice ?? rows[pickFor]!.finalPrice,
                  priced: r.salePrice != null,
                }),
          });
          setPickFor(null);
        }}
        onSendToWorker={() => {}}
        onClose={() => setPickFor(null)}
      />
    </div>
  );
}
