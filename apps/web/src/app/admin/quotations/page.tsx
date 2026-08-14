"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileClock,
  Pencil,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ApiException } from "@/lib/api-error-messages";
import { faDate, money, parseNum, qty, toFa } from "@/lib/format";
import { uuid } from "@/lib/uuid";
import type { Customer, LocateResult, PaymentInput, Quotation } from "@/lib/types";
import { CustomerPicker } from "../pos/_components/customer-picker";
import { PaymentDialog } from "../pos/_components/payment-dialog";
import { ProductSearch } from "../pos/_components/product-search";

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
  CANCELLED: { label: "لغو شد", className: "border-destructive text-destructive" },
};

/** ردیفِ قابل‌ویرایش در پیش‌فاکتور — id برای ردیف‌های تازه‌افزوده وجود ندارد. */
type EditLine = {
  key: string;
  productId: string;
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

export default function QuotationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState("ACTIVE");
  const [openId, setOpenId] = React.useState<string | null>(null);
  /**
   * پیش‌فاکتوری که منتظر انتخاب روش پرداخت است.
   *
   * تبدیل بدون پرداخت، فاکتور را با paidAmount صفر ثبت می‌کرد — یعنی هر تبدیل
   * بی‌صدا یک بدهیِ تمام‌مبلغ می‌ساخت، حتی وقتی مشتری نقد داده بود.
   */
  const [payingFor, setPayingFor] = React.useState<{ id: string; total: number; hasCustomer: boolean } | null>(null);

  // ---------- ویرایش ----------
  const [editing, setEditing] = React.useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = React.useState(false);
  const [showProductSearch, setShowProductSearch] = React.useState(false);
  /**
   * undefined = «دست نخورده، همان مشتری فعلی بماند»
   * null = «صریحاً بدون مشتری»
   * Customer = مشتریِ تازه انتخاب‌شده
   */
  const [editCustomer, setEditCustomer] = React.useState<Customer | null | undefined>(undefined);
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
    mutationFn: (v: { id: string; payments: PaymentInput[]; dueDate?: string }) =>
      convertQuotation(v.id, v.payments, v.dueDate),
    onSuccess: (inv) => {
      toast.success(`فاکتور ${toFa(inv.number)} ثبت شد — ${money(inv.total)} ریال`);
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
    onSuccess: () => { toast.success("اعتبار تمدید شد"); refresh(); },
    onError: () => toast.error("تمدید ناموفق بود"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelQuotation(id),
    onSuccess: () => { toast.success("پیش‌فاکتور لغو شد"); setOpenId(null); refresh(); },
    onError: () => toast.error("لغو ناموفق بود"),
  });

  const q: Quotation | undefined = detail.data;

  const startEdit = () => {
    if (!q) return;
    setEditLines(
      q.lines?.map((l) => ({
        key: uuid(),
        productId: l.product.id,
        productName: l.product.name,
        unit: l.product.unit ?? "عدد",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
      })) ?? []
    );
    setEditCustomer(undefined);
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
          l.productId === r.id ? { ...l, quantity: l.quantity + 1 } : l
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
    0
  );

  const saveEdit = useMutation({
    mutationFn: () =>
      updateQuotation(q!.id, {
        customerId:
          editCustomer === undefined ? q!.customerId ?? null : editCustomer?.id ?? null,
        discount: q!.discount,
        lines: editLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
      }),
    onSuccess: () => {
      toast.success("پیش‌فاکتور ویرایش شد");
      setEditing(false);
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "ذخیره‌ی تغییرات ناموفق بود"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="پیش‌فاکتورها"
        description="قیمت‌هایی که به مشتری داده شده و هنوز فروش نشده‌اند"
        icon={FileClock}
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data?.data.length ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          پیش‌فاکتوری در این وضعیت نیست.
          <br />
          <span className="text-xs">
            پیش‌فاکتور از صندوق فروش ساخته می‌شود — سبد را ببندید و
            <kbd className="mx-1 rounded border px-1.5 py-0.5">F8</kbd> بزنید.
          </span>
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره</TableHead>
                <TableHead>مشتری</TableHead>
                <TableHead className="text-center">اقلام</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>اعتبار</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-start">مبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.data.map((row) => {
                const s = STATUS_STYLE[row.displayStatus] ?? STATUS_STYLE.ACTIVE;
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => { setOpenId(row.id); setEditing(false); }}
                    className="cursor-pointer hover:bg-primary/5"
                  >
                    <TableCell className="font-medium tabular-nums">{toFa(row.number)}</TableCell>
                    <TableCell>{row.customerName ?? "بدون مشتری"}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {toFa(row._count?.lines ?? 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {faDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.displayStatus === "ACTIVE" ? remaining(row.remainingMinutes) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.className}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">{money(row.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* جزئیات */}
      <Dialog
        open={!!openId}
        onOpenChange={(v) => { if (!v) { setOpenId(null); setEditing(false); } }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              پیش‌فاکتور {q ? toFa(q.number) : ""}
            </DialogTitle>
          </DialogHeader>

          {detail.isLoading || !q ? (
            <LoadingState />
          ) : editing ? (
            <div className="space-y-4">
              {/* مشتری — انتساب / تغییر / حذف */}
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">مشتری</p>
                  <p className="truncate font-medium">
                    {editCustomer === undefined
                      ? q.customerName ?? "بدون مشتری"
                      : editCustomer?.fullName ?? "بدون مشتری"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowCustomerPicker(true)}>
                    <UserRound className="size-4" />
                    {q.customerName || editCustomer ? "تغییر" : "انتساب"}
                  </Button>
                  {(q.customerName || editCustomer) && (
                    <Button variant="ghost" size="sm" onClick={() => setEditCustomer(null)}>
                      حذف
                    </Button>
                  )}
                </div>
              </div>

              {/* اقلام — کم/زیاد/حذف */}
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr className="text-muted-foreground">
                      <th className="p-2 text-start font-medium">کالا</th>
                      <th className="w-24 p-2 text-start font-medium">تعداد</th>
                      <th className="w-36 p-2 text-start font-medium">قیمت واحد</th>
                      <th className="w-24 p-2 text-end font-medium">جمع</th>
                      <th className="w-10 p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((l, i) => (
                      <tr key={l.key} className="border-t">
                        <td className="p-2 font-medium">{l.productName}</td>
                        <td className="p-2">
                          <Input
                            dir="ltr"
                            className="h-8 w-20 text-left tabular-nums"
                            value={qty(l.quantity)}
                            onChange={(e) =>
                              patchEditLine(i, { quantity: parseNum(e.target.value) })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <MoneyInput
                            className="h-8 w-32 text-left text-sm tabular-nums"
                            value={l.unitPrice}
                            onChange={(n) => patchEditLine(i, { unitPrice: n })}
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

              <Button variant="outline" size="sm" onClick={() => setShowProductSearch(true)}>
                <Plus className="size-4" /> افزودن کالا
              </Button>

              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <span className="font-semibold">مبلغ کل</span>
                <span className="text-lg font-bold tabular-nums">
                  {money(Math.max(0, editSubtotal - q.discount))} ریال
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
                  className={(STATUS_STYLE[q.displayStatus] ?? STATUS_STYLE.ACTIVE).className}
                >
                  {(STATUS_STYLE[q.displayStatus] ?? STATUS_STYLE.ACTIVE).label}
                </Badge>
                <span>{q.customerName ?? "بدون مشتری"}</span>
                <span className="text-muted-foreground">
                  اعتبار تا {faDate(q.validUntil)}
                  {q.displayStatus === "ACTIVE" && ` — ${remaining(q.remainingMinutes)} مانده`}
                </span>
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border">
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
                          {l.product.name}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{qty(l.quantity)}</TableCell>
                        <TableCell className="tabular-nums">{money(l.unitPrice)}</TableCell>
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
                <span className="text-lg font-bold tabular-nums">{money(q.total)} ریال</span>
              </div>

              {q.displayStatus === "EXPIRED" && (
                <p className="rounded-md border-e-4 border-e-amber-600 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                  اعتبار این پیش‌فاکتور تمام شده. برای تبدیل به فاکتور باید تمدید شود —
                  چون قیمت‌ها ممکن است از زمان صدور تغییر کرده باشند.
                </p>
              )}

              {(q.displayStatus === "ACTIVE" || q.displayStatus === "EXPIRED") && (
                <div className="flex flex-wrap gap-2">
                  {q.displayStatus === "ACTIVE" && (
                    <Button variant="outline" disabled={!q.lines?.length} onClick={startEdit}>
                      <Pencil className="size-4" /> ویرایش
                    </Button>
                  )}

                  <Button
                    className="flex-1"
                    disabled={q.displayStatus !== "ACTIVE" || convert.isPending}
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
                    onClick={() => router.push(`/admin/pos?quotation=${q.id}`)}
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
                    onClick={() => extend.mutate({ id: q.id, minutes: 24 * 60 })}
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
        </DialogContent>
      </Dialog>

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
        onPick={(c) => { setEditCustomer(c); setShowCustomerPicker(false); }}
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
