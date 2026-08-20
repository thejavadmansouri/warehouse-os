"use client";

// صفحه لیست محصولات — طبق بخش ۶.۳ سند
// شامل جستجوی debounce، جدول، export CSV، ویرایش، حذف و ایجاد محصول
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Package,
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  Printer,
} from "lucide-react";

import {
  getProductsPaged,
  searchProducts,
  exportProductsCsv,
  deleteProduct,
  assetUrl,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LabelPrintDialog } from "@/components/labels/label-print-dialog";
import { ProductFormDialog } from "./_components/product-form-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Product } from "@/lib/types";

type SortKey = "name" | "sku" | "salePrice" | "updatedAt";

export default function ProductsListPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canDelete = user?.role === "ADMIN";

  const { toast } = useToast();
  const qc = useQueryClient();

  // --- جستجوی debounce ---
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const hasQuery = debouncedQ.length > 0;

  // صفحه‌بندی مرور کل کاتالوگ (فقط وقتی جستجو نیست)
  const PAGE_SIZE = 50;
  const [page, setPage] = React.useState(1);
  // با تغییر/شروع جستجو به صفحه‌ی ۱ برگرد
  React.useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  // GET /products?page=&limit= (بدون جستجو) — صفحه‌بندی‌شده با meta
  const productsQ = useQuery({
    queryKey: ["products", "page", page],
    queryFn: () => getProductsPaged(page, PAGE_SIZE),
    enabled: !hasQuery,
  });

  // طبق بخش ۶.۳ — GET /products/search?q=
  const searchQ = useQuery({
    queryKey: ["products", "search", debouncedQ],
    queryFn: () => searchProducts(debouncedQ),
    enabled: hasQuery,
  });

  // ایمن‌سازی کامل داده‌ها برای جلوگیری از ارور iterable
  const searchResults = Array.isArray(searchQ.data) ? searchQ.data : [];
  const productsResults = Array.isArray(productsQ.data?.data) ? productsQ.data!.data : [];
  const totalCount = hasQuery ? searchResults.length : (productsQ.data?.meta.total ?? 0);
  const lastPage = productsQ.data?.meta.lastPage ?? 1;

  const rawProducts: Product[] = hasQuery ? searchResults : productsResults;

  const isLoading = hasQuery ? searchQ.isLoading : productsQ.isLoading;
  const isError = hasQuery ? searchQ.isError : productsQ.isError;
  const error = hasQuery ? searchQ.error : productsQ.error;
  const refetch = hasQuery ? () => searchQ.refetch() : () => productsQ.refetch();

  // --- فیلتر/مرتب‌سازی سمت کلاینت ---
  const [sortKey, setSortKey] = React.useState<SortKey>("updatedAt");
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "active" | "inactive"
  >("all");

  const products = React.useMemo(() => {
    let list = Array.isArray(rawProducts) ? [...rawProducts] : [];

    if (activeFilter === "active") list = list.filter((p) => p.isActive);
    if (activeFilter === "inactive") list = list.filter((p) => !p.isActive);
    
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (a.name ?? "").localeCompare(b.name ?? "", "fa");
        case "sku":
          return (a.sku ?? "").localeCompare(b.sku ?? "", "en");
        case "salePrice":
          return (a.salePrice ?? 0) - (b.salePrice ?? 0);
        case "updatedAt":
        default: {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        }
      }
    });
    return list;
  }, [rawProducts, sortKey, activeFilter]);

  // --- export CSV ---
  const exportM = useMutation({
    mutationFn: () => exportProductsCsv(),
    onSuccess: () => {
      toast({
        title: "خروجی CSV آماده شد",
        description: "فایل products.csv دانلود شد.",
      });
    },
    onError: (e) => {
      toast({
        title: "خطا در export",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
        variant: "destructive",
      });
    },
  });

  // --- حذف محصول ---
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      toast({
        title: "محصول حذف شد",
        description: deleteTarget?.name,
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast({
        title: "خطا در حذف",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
        variant: "destructive",
      });
    },
  });

  // --- انتخاب چندتایی برای چاپ لیبل ---
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [printIds, setPrintIds] = React.useState<string[]>([]);
  const [printOpen, setPrintOpen] = React.useState(false);

  const visibleIds = React.useMemo(() => new Set(products.map((p) => p.id)), [
    products,
  ]);
  const allVisibleSelected =
    visibleIds.size > 0 &&
    Array.from(visibleIds).every((id) => selectedIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected &&
    Array.from(visibleIds).some((id) => selectedIds.has(id));

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openBulkPrint = () => {
    const list = Array.from(selectedIds);
    if (list.length === 0) return;
    setPrintIds(list);
    setPrintOpen(true);
  };

  // --- دیالوگ فرم ایجاد/ویرایش ---
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = React.useState<Product | undefined>(
    undefined
  );

  const openCreate = () => {
    setEditTarget(undefined);
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditTarget(p);
    setFormMode("edit");
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="محصولات"
        description="مدیریت کاتالوگ قطعات و لوازم یدکی"
        icon={Package}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportM.mutate()}
              disabled={exportM.isPending}
            >
              {exportM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              خروجی CSV
            </Button>
            {canCreate ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                محصول جدید
              </Button>
            ) : null}
          </>
        }
      />

      {/* جعبه جستجو + فیلتر */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو بر اساس نام، SKU، بارکد یا شماره فنی..."
            className="pr-9"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="پاک کردن جستجو"
            >
              ✕
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Select
            dir="rtl"
            value={activeFilter}
            onValueChange={(v) =>
              setActiveFilter(v as "all" | "active" | "inactive")
            }
          >
            <SelectTrigger className="w-[150px]" size="sm">
              <SelectValue placeholder="وضعیت" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه</SelectItem>
              <SelectItem value="active">فقط فعال</SelectItem>
              <SelectItem value="inactive">فقط غیرفعال</SelectItem>
            </SelectContent>
          </Select>
          <Select
            dir="rtl"
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger className="w-[150px]" size="sm">
              <SelectValue placeholder="مرتب‌سازی" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">جدیدترین</SelectItem>
              <SelectItem value="name">نام</SelectItem>
              <SelectItem value="sku">SKU</SelectItem>
              <SelectItem value="salePrice">قیمت فروش</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* نوار ابزار انتخاب */}
      {selectedIds.size > 0 ? (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary">
              {selectedIds.size} مورد انتخاب‌شده
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearSelection}
            >
              لغو انتخاب
            </Button>
          </div>
          <Button size="sm" onClick={openBulkPrint}>
            <Printer className="h-4 w-4" />
            چاپ لیبل‌های انتخاب‌شده
          </Button>
        </div>
      ) : null}

      {/* جدول محصولات */}
      <div className="no-print rounded-lg border bg-card shadow-sm">
        {isLoading ? (
          <LoadingState label="در حال بارگذاری محصولات..." />
        ) : isError ? (
          <ErrorState
            message={
              error instanceof ApiException
                ? error.message
                : "بارگذاری محصولات ناموفق بود"
            }
            onRetry={() => refetch()}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title={
              hasQuery ? "نتیجه‌ای یافت نشد" : "هنوز محصولی ثبت نشده است"
            }
            description={
              hasQuery
                ? `برای «${debouncedQ}» محصولی پیدا نشد. عبارت دیگری را امتحان کنید.`
                : "برای افزودن اولین محصول روی «محصول جدید» بزنید."
            }
            icon={hasQuery ? Search : Package}
            action={
              hasQuery ? (
                <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>
                  پاک کردن جستجو
                </Button>
              ) : canCreate ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  محصول جدید
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) =>
                        toggleAllVisible(v === true)
                      }
                      aria-label="انتخاب همه"
                    />
                  </TableHead>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>نام محصول</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>شماره فنی</TableHead>
                  <TableHead>برند</TableHead>
                  <TableHead>مدل خودرو</TableHead>
                  <TableHead className="text-end">قیمت فروش</TableHead>
                  <TableHead className="text-center">وضعیت</TableHead>
                  <TableHead className="text-center">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={(v) =>
                          toggleOne(p.id, v === true)
                        }
                        aria-label={`انتخاب ${p.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/products/${encodeURIComponent(p.id)}`}
                        className="block"
                      >
                        {p.image ? (
                          <img
                            src={assetUrl(p.image)}
                            alt={p.name}
                            className="h-10 w-10 rounded-full border object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/products/${encodeURIComponent(p.id)}`}
                        className="text-[15px] font-semibold hover:text-accent hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.description ? (
                        <p className="line-clamp-1 max-w-xs text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {p.sku}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.partNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.brand?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.vehicleModel?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <span
                        dir="ltr"
                        className="inline-block text-xl font-bold tabular-nums tracking-tight"
                      >
                        {formatPrice(p.salePrice)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400">
                          فعال
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-muted text-muted-foreground hover:bg-muted"
                        >
                          غیرفعال
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {canCreate ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => openEdit(p)}
                            aria-label="ویرایش"
                            title="ویرایش"
                          >
                            <Pencil className="h-5 w-5" />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteTarget(p)}
                            aria-label="حذف"
                            title="حذف"
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* فوتر جدول + صفحه‌بندی */}
        {!isLoading && !isError && products.length > 0 ? (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row">
            <p>
              {hasQuery
                ? `${products.length} نتیجه برای «${debouncedQ}»`
                : `مجموع ${totalCount.toLocaleString("fa-IR")} محصول`}
            </p>
            {!hasQuery && lastPage > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || productsQ.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  قبلی
                </Button>
                <span className="text-xs">
                  صفحه {page.toLocaleString("fa-IR")} از {lastPage.toLocaleString("fa-IR")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= lastPage || productsQ.isFetching}
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                >
                  بعدی
                </Button>
              </div>
            ) : (
              <p className="text-xs">
                برای دیدن جزئیات روی هر محصول کلیک کنید
                <ArrowLeft className="ms-1 inline h-3 w-3" />
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* دیالوگ فرم ایجاد/ویرایش */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initial={formMode === "edit" ? editTarget : undefined}
      />

      {/* دیالوگ تایید حذف */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="حذف محصول"
        description={
          <>
            آیا از حذف محصول{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.name}
            </span>{" "}
            مطمئن هستید؟ محصول غیرفعال می‌شود و از فروش خارج می‌شود؛ سابقه‌ی
            خرید، فروش و موجودی آن پاک نمی‌شود و بعداً می‌توانید دوباره
            فعالش کنید.
          </>
        }
        confirmText="حذف"
        cancelText="انصراف"
        destructive
        loading={deleteM.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteM.mutate(deleteTarget.id);
        }}
      />

      {/* دیالوگ چاپ لیبل محصول */}
      <LabelPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        mode="product"
        ids={printIds}
      />
    </div>
  );
}
