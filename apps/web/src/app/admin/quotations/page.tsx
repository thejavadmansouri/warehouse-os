"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  FileClock,
  Pencil,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";

import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyInput } from "@/components/money-input";

import {
  cancelQuotation,
  convertQuotation,
  extendQuotation,
  getQuotation,
  getQuotations,
  updateQuotation,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
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
import type {
  Customer,
  LocateResult,
  PaymentInput,
  Quotation,
} from "@/lib/types";
import { CustomerPicker } from "../pos/_components/customer-picker";
import { PaymentDialog } from "../pos/_components/payment-dialog";
import { ProductSearch } from "../pos/_components/product-search";
import { BlankQuotationsPanel } from "./_components/blank-quotations";

const TH = "border-b px-2 py-1 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-2 py-1.5 whitespace-nowrap";

const TABS: { id: string; label: string }[] = [
  { id: "ACTIVE", label: "معتبر" },
  { id: "EXPIRED", label: "منقضی" },
  { id: "CONVERTED", label: "تبدیل‌شده" },
  { id: "CANCELLED", label: "لغو‌شده" },
];

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "معتبر", className: "border-emerald-600 text-emerald-700" },
  EXPIRED: { label: "منقضی", className: "border-amber-600 text-amber-700" },
  CONVERTED: { label: "تبدیل شد", className: "border-primary text-primary" },
  CANCELLED: {
    label: "لغو شد",
    className: "border-destructive text-destructive",
  },
};

/** ردیفِ قابل‌ویرایش در پیش‌فاکتور — id برای ردیف‌های تازه‌افزوده وجود ندارد. */
type EditLine = {
  key: string;
  productId: string;
  /** نامِ نمایشی — قابل‌ویرایش؛ خالی یعنی نامِ خودِ کالا چاپ شود. */
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** تخفیف ردیف به ریال — ردیف‌های موجود مقدار خودشان را نگه می‌دارند. */
  discount: number;
};

/** باقی‌مانده‌ی اعتبار به شکل خوانا: «۳ ساعت و ۲۰ دقیقه» */
function remaining(minutes: number): string {
  if (minutes <= 0) return "منقضی";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${toFa(h)} ساعت و ${toFa(m)} دقیقه`;
  if (h) return `${toFa(h)} ساعت`;
  return `${toFa(m)} دقیقه`;
}

/** داخلِ صفحه‌ی «اسناد» سرتیترِ خودش را نشان نمی‌دهد. */
export function QuotationsPanel({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const qc = useQueryClient();
  /**
   * دو سطلِ متفاوت در یک صفحه.
   *
   * «سفید» همان برگه‌ی قیمتی است که کارگر از گوشی با متنِ آزاد می‌سازد؛
   * دیتای جدا دارد و جریانِ کاری جدا (قیمت‌گذاری مدیر)، پس تبِ وضعیت نمی‌تواند
   * نشانش دهد و باید کل فهرست عوض شود.
   */
  const isManager = useAuthStore((s) => s.hasRole)("ADMIN", "MANAGER");
  const [bucket, setBucket] = React.useState<"QUOTATION" | "BLANK">(
    "QUOTATION",
  );
  const [tab, setTab] = React.useState("ACTIVE");
  const [row, setRow] = React.useState(0);
  /*
   * عوض‌شدنِ تب یعنی فهرست عوض می‌شود — ردیفِ فعال باید صفر شود. در حینِ
   * رندر انجام می‌شود نه effect (setState در بدنه‌ی effect رندرِ آبشاری
   * می‌سازد و lint را قرمز می‌کند)؛ همان الگوی pos/page.tsx.
   */
  const [prevTab, setPrevTab] = React.useState(tab);
  if (tab !== prevTab) {
    setPrevTab(tab);
    setRow(0);
  }
  const [openId, setOpenId] = React.useState<string | null>(null);
  /**
   * پیش‌فاکتوری که منتظر انتخاب روش پرداخت است.
   *
   * تبدیل بدون پرداخت، فاکتور را با paidAmount صفر ثبت می‌کرد — یعنی هر تبدیل
   * بی‌صدا یک بدهیِ تمام‌مبلغ می‌ساخت، حتی وقتی مشتری نقد داده بود.
   */
  const [payingFor, setPayingFor] = React.useState<{
    id: string;
    total: number;
    hasCustomer: boolean;
  } | null>(null);

  // ---------- ویرایش ----------
  const [editing, setEditing] = React.useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = React.useState(false);
  const [showProductSearch, setShowProductSearch] = React.useState(false);
  /**
   * undefined = «دست نخورده، همان مشتری فعلی بماند»
   * null = «صریحاً بدون مشتری»
   * Customer = مشتریِ تازه انتخاب‌شده
   */
  const [editCustomer, setEditCustomer] = React.useState<
    Customer | null | undefined
  >(undefined);
  /** نامِ آزادِ مشتری (تایپ مستقیم) — مثل محسن‌فاکتور. */
  const [editCustomerName, setEditCustomerName] = React.useState("");
  const [editLines, setEditLines] = React.useState<EditLine[]>([]);

  const list = useQuery({
    queryKey: ["quotations", tab],
    queryFn: () => getQuotations({ status: tab, limit: 50 }),
  });

  const detail = useQuery({
    queryKey: ["quotation", openId],
    queryFn: () => getQuotation(openId!),
    enabled: !!openId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quotations"] });
    qc.invalidateQueries({ queryKey: ["quotation"] });
  };

  const convert = useMutation({
    mutationFn: (v: {
      id: string;
      payments: PaymentInput[];
      dueDate?: string;
    }) => convertQuotation(v.id, v.payments, v.dueDate),
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} ثبت شد — ${amount(inv.total)}`);
      setPayingFor(null);
      setOpenId(null);
      refresh();
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      if (err?.code === "QUOTATION_EXPIRED") {
        toast.error("اعتبار تمام شده — اول تمدیدش کنید");
      } else if (err?.code === "INSUFFICIENT_STOCK") {
        toast.error("موجودی کافی نیست؛ از زمان صدور پیش‌فاکتور فروش رفته است");
      } else {
        toast.error(err?.message ?? "تبدیل ناموفق بود");
      }
    },
  });

  const extend = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      extendQuotation(id, minutes),
    onSuccess: () => {
      toast.success("اعتبار تمدید شد");
      refresh();
    },
    onError: () => toast.error("تمدید ناموفق بود"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelQuotation(id),
    onSuccess: () => {
      toast.success("پیش‌فاکتور لغو شد");
      setOpenId(null);
      refresh();
    },
    onError: () => toast.error("لغو ناموفق بود"),
  });

  const q: Quotation | undefined = detail.data;

  const startEdit = () => {
    if (!q) return;
    setEditLines(
      q.lines?.map((l) => ({
        key: uuid(),
        productId: l.product.id,
        // نامِ نمایشیِ ذخیره‌شده اگر هست، وگرنه نامِ خودِ کالا.
        productName: l.label?.trim() || l.product.name,
        unit: l.product.unit ?? "عدد",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
      })) ?? [],
    );
    setEditCustomer(undefined);
    setEditCustomerName("");
    setEditing(true);
  };

  const patchEditLine = (i: number, p: Partial<EditLine>) =>
    setEditLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const removeEditLine = (key: string) =>
    setEditLines((prev) => prev.filter((l) => l.key !== key));

  const addEditProduct = (r: LocateResult) => {
    setEditLines((prev) => {
      const existing = prev.find((l) => l.productId === r.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === r.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: uuid(),
          productId: r.id,
          productName: r.name,
          unit: r.unit ?? "عدد",
          quantity: 1,
          unitPrice: r.salePrice ?? 0,
          discount: 0,
        },
      ];
    });
    setShowProductSearch(false);
  };

  const editSubtotal = editLines.reduce(
    (s, l) => s + l.quantity * l.unitPrice - l.discount,
    0,
  );

  const saveEdit = useMutation({
    mutationFn: () =>
      updateQuotation(q!.id, {
        /*
         * مشتری: یا پیوندِ انتخاب‌شده، یا نامِ آزادِ تایپ‌شده. وقتی اسم را
         * مستقیم تایپ کرده، پیوندی نمی‌فرستیم تا مشتریِ بی‌شماره ساخته نشود.
         */
        customerId: editCustomerName.trim()
          ? null
          : editCustomer === undefined
            ? (q!.customerId ?? null)
            : (editCustomer?.id ?? null),
        customerName: editCustomerName.trim() || undefined,
        discount: q!.discount,
        lines: editLines.map((l) => {
          const name = l.productName.trim();
          return {
            productId: l.productId,
            // نامِ ویرایش‌شده اگر با نامِ خودِ کالا فرق دارد؛ خالی یعنی نامِ کالا.
            ...(name ? { label: name } : {}),
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
          };
        }),
      }),
    onSuccess: () => {
      toast.success("پیش‌فاکتور ویرایش شد");
      setEditing(false);
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiException ? e.message : "ذخیره‌ی تغییرات ناموفق بود",
      ),
  });

  const rows = list.data?.data ?? [];

  /** ردیفِ فعال همیشه باید دیده شود — کیبورد خودش اسکرول نمی‌کند. */
  React.useEffect(() => {
    document
      .querySelector('[data-active-row="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [row, rows.length]);

  /*
   * قیمت‌گذاری کارِ مدیر است (روت‌های سرور هم همین را می‌گویند)، پس سطلِ
   * «برگه‌ی سفید» برای فروشنده هم دیده نمی‌شود: تبِ بازِ بی‌اجازه فقط یک خطای
   * ۴۰۳ به فروشنده نشان می‌دهد و او فکر می‌کند سیستم خراب است.
   */
  const bucketSwitch = !isManager ? null : (
    <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
      {(
        [
          ["QUOTATION", "پیش‌فاکتور"],
          ["BLANK", "برگه‌ی سفید"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setBucket(id)}
          className={`px-3 py-1.5 ${
            bucket === id
              ? "bg-primary text-primary-foreground"
              : "bg-background"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  /* برگه‌های سفید فهرست و دیالوگ خودشان را دارند؛ فقط نوارِ انتخاب مشترک است. */
  if (bucket === "BLANK") {
    return (
      <div
        className={`flex flex-col ${embedded ? "min-h-0 flex-1" : "h-[calc(100vh-2.5rem)]"}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          {bucketSwitch}
        </div>
        <BlankQuotationsPanel />
      </div>
    );
  }

  return (
    /* همان الگوی بقیه‌ی فهرست‌ها: یک سطر فیلتر، یک جدول، یک نوار کلید. */
    <div
      tabIndex={-1}
      className={`flex flex-col outline-none ${embedded ? "min-h-0 flex-1" : "h-[calc(100vh-2.5rem)]"}`}
      onKeyDown={(e) => {
        if (openId || payingFor) return;
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setRow((r) => Math.min(r + 1, Math.max(rows.length - 1, 0)));
            return;
          case "ArrowUp":
            e.preventDefault();
            setRow((r) => Math.max(r - 1, 0));
            return;
          case "Enter":
            e.preventDefault();
            if (rows[row]) {
              setOpenId(rows[row].id);
              setEditing(false);
            }
            return;
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        {bucketSwitch}
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          aria-label="وضعیت"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {toFa(rows.length)} پیش‌فاکتور
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            پیش‌فاکتوری در این وضعیت نیست — از صندوق با
            <kbd className="mx-1 rounded border px-1.5 py-0.5">F8</kbd> ساخته
            می‌شود.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr>
                <th className={`${TH} w-20`}>شماره</th>
                <th className={`${TH} w-24`}>تاریخ</th>
                <th className={`${TH} w-16`}>ساعت</th>
                <th className={TH}>مشتری</th>
                <th className={`${TH} w-16 text-center`}>اقلام</th>
                <th className={`${TH} w-24`}>اعتبار</th>
                <th className={`${TH} w-28`}>وضعیت</th>
                <th className={`${TH} w-36`}>مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const st = STATUS_STYLE[r.displayStatus] ?? STATUS_STYLE.ACTIVE;
                return (
                  <tr
                    key={r.id}
                    data-active-row={i === row}
                    onMouseEnter={() => setRow(i)}
                    onClick={() => {
                      setOpenId(r.id);
                      setEditing(false);
                    }}
                    className="cursor-pointer border-b odd:bg-muted/25"
                  >
                    <td className={`${TD} font-bold tabular-nums`}>
                      {toFa(r.number)}
                    </td>
                    <td className={`${TD} tabular-nums text-muted-foreground`}>
                      {faDate(r.createdAt)}
                    </td>
                    <td className={`${TD} tabular-nums text-muted-foreground`}>
                      {faTime(r.createdAt)}
                    </td>
                    <td className={`${TD} max-w-0 truncate`}>
                      {r.customerName ?? "بدون مشتری"}
                    </td>
                    <td className={`${TD} text-center tabular-nums`}>
                      {toFa(r._count?.lines ?? 0)}
                    </td>
                    <td className={`${TD} text-xs`}>
                      {r.displayStatus === "ACTIVE"
                        ? remaining(r.remainingMinutes)
                        : "—"}
                    </td>
                    <td className={TD}>
                      <Badge variant="outline" className={st.className}>
                        {st.label}
                      </Badge>
                    </td>
                    <td className={`${TD} text-end font-bold tabular-nums`}>
                      {money(r.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-x-5 border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        {(
          [
            ["↑↓", "حرکت"],
            ["Enter", "باز کردن"],
          ] as [string, string][]
        ).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]">
              {k}
            </kbd>
            {label}
          </span>
        ))}
      </div>

      {/* workspace تمام‌صفحه؛ جزئیات پیش‌فاکتور برای کار طولانی نباید در Dialog محدود شود. */}
      {openId && (
        <div
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background outline-none"
          onKeyDown={(e) => {
            if (
              e.key === "Escape" &&
              !payingFor &&
              !showCustomerPicker &&
              !showProductSearch
            ) {
              e.preventDefault();
              setOpenId(null);
              setEditing(false);
            }
          }}
        >
          <div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpenId(null);
                setEditing(false);
              }}
            >
              <ArrowRight className="size-4" />
              بازگشت
            </Button>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">
                پیش‌فاکتور {q ? toFa(q.number) : ""}
              </h2>
              <p className="text-xs text-muted-foreground">
                مشاهده و ویرایش سند
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            {detail.isLoading || !q ? (
              <LoadingState />
            ) : editing ? (
              <div className="space-y-4">
                {/* مشتری — تایپ آزاد (مثل محسن‌فاکتور) یا انتخاب از لیست */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">مشتری</p>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCustomerPicker(true)}
                      >
                        <UserRound className="size-4" />
                        {editCustomerName.trim()
                          ? "انتخاب از لیست"
                          : q.customerName || editCustomer
                            ? "تغییر"
                            : "انتساب"}
                      </Button>
                      {(q.customerName ||
                        editCustomer ||
                        editCustomerName.trim()) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditCustomer(null);
                            setEditCustomerName("");
                          }}
                        >
                          حذف
                        </Button>
                      )}
                    </div>
                  </div>
                  <Input
                    dir="rtl"
                    className="mt-2 h-9"
                    placeholder="نام مشتری را تایپ کنید…"
                    value={
                      editCustomerName
                        ? editCustomerName
                        : editCustomer === undefined
                          ? (q.customerName ?? "")
                          : (editCustomer?.fullName ?? "")
                    }
                    onChange={(e) => {
                      setEditCustomerName(e.target.value);
                      if (e.target.value.trim()) setEditCustomer(null);
                    }}
                  />
                </div>

                {/* اقلام — کم/زیاد/حذف */}
                <div className="overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr className="text-muted-foreground">
                        <th className="p-2 text-start font-medium">کالا</th>
                        <th className="w-24 p-2 text-start font-medium">
                          تعداد
                        </th>
                        <th className="w-36 p-2 text-start font-medium">
                          قیمت واحد
                        </th>
                        <th className="w-24 p-2 text-end font-medium">جمع</th>
                        <th className="w-10 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {editLines.map((l, i) => (
                        <tr key={l.key} className="border-t">
                          <td className="p-2">
                            {/* نامِ قابل‌ویرایش — مثل محسن‌فاکتور: هر قلم را می‌شود عوض کرد. */}
                            <Input
                              dir="rtl"
                              className="h-8 w-full min-w-40 text-sm font-medium"
                              value={l.productName}
                              onChange={(e) =>
                                patchEditLine(i, {
                                  productName: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              dir="ltr"
                              className="h-8 w-20 text-right tabular-nums"
                              value={qty(l.quantity)}
                              onChange={(e) =>
                                patchEditLine(i, {
                                  quantity: parseNum(e.target.value),
                                })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <MoneyInput
                              className="h-8 w-32 text-right text-sm tabular-nums"
                              value={l.unitPrice}
                              onChange={(n) =>
                                patchEditLine(i, { unitPrice: n })
                              }
                            />
                          </td>
                          <td className="p-2 text-end font-medium tabular-nums">
                            {money(l.quantity * l.unitPrice - l.discount)}
                          </td>
                          <td className="p-2 text-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="حذف ردیف"
                              onClick={() => removeEditLine(l.key)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProductSearch(true)}
                >
                  <Plus className="size-4" /> افزودن کالا
                </Button>

                <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                  <span className="font-semibold">مبلغ کل</span>
                  <span className="text-lg font-bold tabular-nums">
                    {amount(Math.max(0, editSubtotal - q.discount))}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={saveEdit.isPending || editLines.length === 0}
                    onClick={() => saveEdit.mutate()}
                  >
                    {saveEdit.isPending ? "در حال ذخیره…" : "ذخیره تغییرات"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    انصراف
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge
                    variant="outline"
                    className={
                      (STATUS_STYLE[q.displayStatus] ?? STATUS_STYLE.ACTIVE)
                        .className
                    }
                  >
                    {
                      (STATUS_STYLE[q.displayStatus] ?? STATUS_STYLE.ACTIVE)
                        .label
                    }
                  </Badge>
                  <span>{q.customerName ?? "بدون مشتری"}</span>
                  <span className="text-muted-foreground">
                    اعتبار تا {faDate(q.validUntil)}
                    {q.displayStatus === "ACTIVE" &&
                      ` — ${remaining(q.remainingMinutes)} مانده`}
                  </span>
                </div>

                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>کالا</TableHead>
                        <TableHead className="text-center">تعداد</TableHead>
                        <TableHead className="text-start">قیمت واحد</TableHead>
                        <TableHead className="text-start">جمع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {q.lines?.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="max-w-[20rem] truncate font-medium">
                            {l.label?.trim() || l.product.name}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {qty(l.quantity)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {money(l.unitPrice)}
                          </TableCell>
                          <TableCell className="font-medium tabular-nums">
                            {money(l.quantity * l.unitPrice - l.discount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                  <span className="font-semibold">مبلغ کل</span>
                  <span className="text-lg font-bold tabular-nums">
                    {amount(q.total)}
                  </span>
                </div>

                {q.displayStatus === "EXPIRED" && (
                  <p className="rounded-md border-e-4 border-e-amber-600 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                    اعتبار این پیش‌فاکتور تمام شده. برای تبدیل به فاکتور باید
                    تمدید شود — چون قیمت‌ها ممکن است از زمان صدور تغییر کرده
                    باشند.
                  </p>
                )}

                {(q.displayStatus === "ACTIVE" ||
                  q.displayStatus === "EXPIRED") && (
                  <div className="flex flex-wrap gap-2">
                    {q.displayStatus === "ACTIVE" && (
                      <Button
                        variant="outline"
                        disabled={!q.lines?.length}
                        onClick={startEdit}
                      >
                        <Pencil className="size-4" /> ویرایش
                      </Button>
                    )}

                    <Button
                      className="flex-1"
                      disabled={
                        q.displayStatus !== "ACTIVE" || convert.isPending
                      }
                      onClick={() =>
                        setPayingFor({
                          id: q.id,
                          total: q.total,
                          // برای نسیه لازم است: PaymentDialog بدون مشتری اجازه‌ی CREDIT نمی‌دهد.
                          hasCustomer: !!q.customerName,
                        })
                      }
                    >
                      {convert.isPending ? "در حال ثبت…" : "تبدیل به فاکتور"}
                    </Button>

                    {/* بردن به صندوق — سبد از این پیش‌فاکتور پر می‌شود و فروشنده ادامه می‌دهد. */}
                    <Button
                      variant="outline"
                      onClick={() =>
                        router.push(`/admin/pos?quotation=${q.id}`)
                      }
                    >
                      <ShoppingCart className="size-4" /> ادامه در صندوق
                    </Button>

                    {/* چاپ در پنجره‌ی جدا، تا این صفحه و وضعیتش سر جایش بماند. */}
                    <Button
                      variant="outline"
                      onClick={() =>
                        window.open(`/admin/print/quotation/${q.id}`, "_blank")
                      }
                    >
                      <Printer className="size-4" /> چاپ
                    </Button>

                    <Button
                      variant="outline"
                      disabled={extend.isPending}
                      onClick={() =>
                        extend.mutate({ id: q.id, minutes: 24 * 60 })
                      }
                    >
                      تمدید ۲۴ ساعت
                    </Button>

                    <Button
                      variant="ghost"
                      className="text-destructive"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(q.id)}
                    >
                      لغو
                    </Button>
                  </div>
                )}

                {q.displayStatus === "CONVERTED" && (
                  <p className="text-sm text-muted-foreground">
                    این پیش‌فاکتور به فاکتور تبدیل شده است.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* روش پرداخت — گام اجباری پیش از تبدیل. */}
      <PaymentDialog
        open={!!payingFor}
        total={payingFor?.total ?? 0}
        hasCustomer={payingFor?.hasCustomer ?? false}
        onConfirm={(payments, dueDate) =>
          payingFor && convert.mutate({ id: payingFor.id, payments, dueDate })
        }
        onClose={() => setPayingFor(null)}
      />

      {/* انتساب/تغییر مشتری در حالت ویرایش */}
      <CustomerPicker
        open={showCustomerPicker}
        onPick={(c) => {
          setEditCustomer(c);
          setEditCustomerName(""); // انتخاب از لیست، نامِ آزاد را پاک می‌کند.
          setShowCustomerPicker(false);
        }}
        onClose={() => setShowCustomerPicker(false)}
      />

      {/* افزودن کالا در حالت ویرایش */}
      <ProductSearch
        open={showProductSearch}
        onPick={addEditProduct}
        onSendToWorker={() => {}}
        onClose={() => setShowProductSearch(false)}
      />
    </div>
  );
}

/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function QuotationsPage() {
  return <QuotationsPanel />;
}
