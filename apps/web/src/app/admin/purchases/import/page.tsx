"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  confirmPurchaseImport,
  downloadPurchaseImportTemplate,
  getSuppliers,
  getWarehouses,
  previewPurchaseImport,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { uuid } from "@/lib/uuid";
import type { Product, PurchaseImportRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toFa } from "@/lib/format";
import { ProductSearchSelect } from "@/components/product-search-select";
import { QuickAddProductDialog } from "@/app/admin/purchases/_components/quick-add-product-dialog";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

export default function PurchaseImportPage() {
  const router = useRouter();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<PurchaseImportRow[]>([]);
  const [warehouseId, setWarehouseId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("NONE");
  const [supplierRef, setSupplierRef] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState("");
  const [creatingRow, setCreatingRow] =
    React.useState<PurchaseImportRow | null>(null);
  const [activeRow, setActiveRow] = React.useState<number | null>(null);
  const rowRefs = React.useRef<Record<number, HTMLTableRowElement | null>>({});

  const warehousesQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: getWarehouses,
    enabled: canUse,
  });
  const suppliersQ = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
    enabled: canUse,
  });

  const preview = useMutation({
    mutationFn: (selected: File) => previewPurchaseImport(selected),
    onSuccess: (result) => {
      setRows(result);
      toast.success(`${toFa(result.length)} ردیف بررسی شد`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiException
          ? error.message
          : "خواندن فایل ناموفق بود",
      ),
  });
  const confirm = useMutation({
    mutationFn: () =>
      confirmPurchaseImport({
        idempotencyKey: uuid(),
        warehouseId: warehouseId || warehousesQ.data?.[0]?.id || "",
        supplierId: supplierId === "NONE" ? null : supplierId,
        supplierRef: supplierRef.trim() || undefined,
        invoiceDate: invoiceDate || undefined,
        lines: rows
          .filter((r) => r.status === "READY" && r.product)
          .map((r) => ({
            productId: r.product!.id,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
          })),
      }),
    onSuccess: (purchase) => {
      toast.success(`فاکتور خرید ${toFa(purchase.number)} ثبت شد`);
      router.push(`/admin/purchases/${purchase.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiException ? error.message : "ثبت فاکتور ناموفق بود",
      ),
  });

  const ready = rows.filter(
    (r) =>
      r.status === "READY" && r.product && r.quantity > 0 && r.unitPrice >= 0,
  );
  const review = rows.length - ready.length;
  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    rowRefs.current[row.row]?.focus();
    setActiveRow(row.row);
  };

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches(
        "input, textarea, select, [contenteditable=true]",
      );
      if (event.key === "F2" && !typing && activeRow !== null) {
        event.preventDefault();
        document.getElementById(`import-product-${activeRow}`)?.click();
      }
      if (
        event.ctrlKey &&
        event.key === "Enter" &&
        rows.length > 0 &&
        review === 0
      ) {
        event.preventDefault();
        if (!confirm.isPending) confirm.mutate();
      }
      if (event.key === "Escape" && !typing && !creatingRow) {
        event.preventDefault();
        router.push("/admin/purchases");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeRow, confirm, creatingRow, review, rows.length, router]);

  if (!canUse)
    return (
      <Card className="p-6 text-center text-muted-foreground">
        ورود خرید فقط برای مدیر است.
      </Card>
    );

  const setProduct = (rowNumber: number, product: Product | null) => {
    setRows((current) =>
      current.map((row) =>
        row.row === rowNumber
          ? {
              ...row,
              product: product
                ? { id: product.id, name: product.name, sku: product.sku }
                : null,
              status:
                product && row.quantity > 0 && row.unitPrice >= 0
                  ? "READY"
                  : "REVIEW",
            }
          : row,
      ),
    );
  };

  return (
    <div className="flex min-h-full flex-col gap-4 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/purchases")}
            aria-label="بازگشت"
          >
            <ArrowRight className="size-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">ورود فاکتور خرید از Excel</h1>
            <p className="text-xs text-muted-foreground">
              ابتدا پیش‌نمایش بگیرید؛ فقط ردیف‌های تطبیق‌داده‌شده ثبت می‌شوند.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadPurchaseImportTemplate().catch(() =>
              toast.error("دانلود قالب ناموفق بود"),
            )
          }
        >
          <Download className="me-2 size-4" />
          دانلود قالب نمونه
        </Button>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="فایل Excel">
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows([]);
            }}
          />
        </Field>
        <Field label="انبار مقصد">
          <Select
            value={warehouseId || warehousesQ.data?.[0]?.id || ""}
            onValueChange={setWarehouseId}
          >
            <SelectTrigger>
              <SelectValue placeholder="انتخاب انبار" />
            </SelectTrigger>
            <SelectContent>
              {(warehousesQ.data ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="تأمین‌کننده">
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب تأمین‌کننده" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">بدون تأمین‌کننده</SelectItem>
              {(suppliersQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="شماره فاکتور فروشنده">
          <Input
            value={supplierRef}
            onChange={(e) => setSupplierRef(e.target.value)}
          />
        </Field>
        <Field label="تاریخ فاکتور">
          <Input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!file || preview.isPending}
            onClick={() => file && preview.mutate(file)}
          >
            <Upload className="me-2 size-4" />
            {preview.isPending ? "در حال بررسی…" : "پیش‌نمایش فایل"}
          </Button>
        </div>
      </Card>

      {rows.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="size-4 text-primary" />
              نتیجه تطبیق کالاها
            </div>
            <div className="text-sm text-muted-foreground">
              آماده: {toFa(ready.length)} · نیازمند بررسی: {toFa(review)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ردیف</TableHead>
                  <TableHead>نام فایل</TableHead>
                  <TableHead>SKU/بارکد</TableHead>
                  <TableHead>تعداد</TableHead>
                  <TableHead>قیمت خرید</TableHead>
                  <TableHead>تطبیق دستی</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.row}
                    ref={(element) => {
                      rowRefs.current[row.row] = element;
                    }}
                    tabIndex={0}
                    aria-selected={activeRow === row.row}
                    onFocus={() => setActiveRow(row.row)}
                    onKeyDown={(event) => {
                      const index = rows.findIndex(
                        (item) => item.row === row.row,
                      );
                      if (
                        event.key === "ArrowDown" ||
                        event.key === "ArrowUp"
                      ) {
                        event.preventDefault();
                        focusRow(index + (event.key === "ArrowDown" ? 1 : -1));
                      } else if (event.key === "Enter" || event.key === "F2") {
                        event.preventDefault();
                        document
                          .getElementById(`import-product-${row.row}`)
                          ?.click();
                      }
                    }}
                    className="focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <TableCell>{toFa(row.row)}</TableCell>
                    <TableCell>{row.productName || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.sku || row.barcode || "—"}
                    </TableCell>
                    <TableCell>{toFa(row.quantity)}</TableCell>
                    <TableCell>{toFa(row.unitPrice)}</TableCell>
                    <TableCell className="min-w-[18rem]">
                      <div className="flex items-center gap-2">
                        <ProductSearchSelect
                          id={`import-product-${row.row}`}
                          value={row.product?.id}
                          onChange={(product) => setProduct(row.row, product)}
                          placeholder={
                            row.product
                              ? `${row.product.name} (${row.product.sku})`
                              : "انتخاب کالای موجود"
                          }
                          className="min-w-0 flex-1"
                        />
                        {!row.product ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            id={`import-create-${row.row}`}
                            onClick={() => setCreatingRow(row)}
                          >
                            ساخت جدید
                          </Button>
                        ) : null}
                      </div>
                      <div
                        className={`mt-1 text-xs ${row.status === "READY" ? "text-emerald-600" : "text-destructive"}`}
                      >
                        {row.product
                          ? `${row.product.name} (${row.product.sku})`
                          : "کالا پیدا نشد"}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">
              ↑↓ ردیف · Enter/F2 انتخاب کالا · Ctrl+Enter ثبت · Esc بازگشت
            </p>
            <Button
              disabled={
                confirm.isPending ||
                !(warehouseId || warehousesQ.data?.[0]?.id) ||
                ready.length === 0 ||
                review > 0
              }
              onClick={() => confirm.mutate()}
            >
              <CheckCircle2 className="me-2 size-4" />
              ثبت فاکتور واردشده
            </Button>
          </div>
        </Card>
      ) : null}
      <QuickAddProductDialog
        open={!!creatingRow}
        onOpenChange={(open) => !open && setCreatingRow(null)}
        barcode={creatingRow?.barcode}
        suggestedName={creatingRow?.productName}
        defaultPurchasePrice={creatingRow?.unitPrice}
        onCreated={(product) => {
          if (creatingRow) setProduct(creatingRow.row, product);
          setCreatingRow(null);
        }}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
