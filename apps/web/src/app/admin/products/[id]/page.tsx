"use client";

// صفحه جزئیات + ویرایش محصول — طبق بخش ۶.۳ سند
// شامل نمایش اطلاعات کامل، آپلود عکس، ویرایش از طریق دیالوگ فرم
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Pencil,
  Upload,
  ImageIcon,
  Package,
  Loader2,
  Barcode,
  Tag,
  Boxes,
  Banknote,
  Scale,
  FileText,
  Calendar,
  Printer,
} from "lucide-react";

import { getProduct, uploadProductImage, assetUrl } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import {
  formatPrice,
  formatNumber,
  formatDateTime,
} from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { LabelPrintDialog } from "@/components/labels/label-print-dialog";
import { ProductFormDialog } from "../_components/product-form-dialog";
import { ProductKardex } from "../_components/product-kardex";
import { ProductStock } from "../_components/product-stock";
import { ProductPrices } from "../_components/product-prices";
import { ProductBarcodes } from "../_components/product-barcodes";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Product } from "@/lib/types";

interface InfoRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ icon: Icon, label, value, mono }: InfoRowProps) {
  const isEmpty = value === undefined || value === null || value === "";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div
        className={`text-sm font-medium ${
          mono ? "font-mono tabular-nums" : ""
        } ${isEmpty ? "text-muted-foreground/60" : ""}`}
      >
        {isEmpty ? "—" : value}
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";

  const { toast } = useToast();
  const qc = useQueryClient();

  // طبق بخش ۶.۳ — GET /products/:id
  const productQ = useQuery({
    queryKey: ["product", id],
    queryFn: () => getProduct(id as string),
    enabled: !!id,
  });

  // --- آپلود عکس ---
  // طبق بخش ۶.۳ — POST /uploads/product/:id/image
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [imgVersion, setImgVersion] = React.useState(0);

  const uploadM = useMutation({
    mutationFn: (file: File) => uploadProductImage(id as string, file),
    onSuccess: () => {
      toast({
        title: "عکس آپلود شد",
        description: "تصویر محصول به‌روزرسانی شد.",
      });
      setImgVersion((v) => v + 1);
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => {
      toast({
        title: "خطا در آپلود عکس",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
        variant: "destructive",
      });
    },
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({
        title: "فایل نامعتبر",
        description: "لطفاً یک فایل تصویری انتخاب کنید.",
        variant: "destructive",
      });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({
        title: "حجم زیاد",
        description: "حداکثر حجم مجاز ۵ مگابایت است.",
        variant: "destructive",
      });
      return;
    }
    uploadM.mutate(f);
    // ریست input تا انتخاب مجدد همان فایل هم کار کند
    e.target.value = "";
  };

  // --- دیالوگ ویرایش ---
  const [editOpen, setEditOpen] = React.useState(false);

  // --- دیالوگ چاپ لیبل — طبق بخش الف سند افزونه ---
  const [printOpen, setPrintOpen] = React.useState(false);

  const product: Product | undefined = productQ.data;

  const imageUrl = product?.image
    ? imgVersion > 0
      ? `${assetUrl(product.image)}?v=${imgVersion}`
      : assetUrl(product.image)
    : "";

  if (!id) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="محصول" icon={Package} />
        <ErrorState message="شناسه محصول نامعتبر است." />
      </div>
    );
  }

  if (productQ.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="جزئیات محصول" icon={Package} />
        <Card className="shadow-sm">
          <CardContent>
            <LoadingState label="در حال بارگذاری اطلاعات محصول..." />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (productQ.isError || !product) {
    const err = productQ.error;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="جزئیات محصول" icon={Package} />
        <ErrorState
          message={
            err instanceof ApiException
              ? err.message
              : "بارگذاری محصول ناموفق بود."
          }
          onRetry={() => productQ.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.name}
        description={`SKU: ${product.sku}`}
        icon={Package}
        actions={
          <div className="no-print flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrintOpen(true)}
            >
              <Printer className="h-4 w-4" />
              چاپ لیبل
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/products">
                <ArrowRight className="h-4 w-4" />
                بازگشت به لیست
              </Link>
            </Button>
          </div>
        }
      />

      {/*
        صفحه‌ی کالا تنها جای حقیقت درباره‌ی یک کالاست: مشخصات، موجودی، گردش و
        قیمت — همه زیر یک آدرس.
        قبلاً کاردکس صفحه‌ی جدای خودش را هم داشت (`/admin/inventory/kardex`) که
        چیزی جز یک انتخابگر کالا + همین کامپوننت نبود، و موجودیِ به‌تفکیکِ قفسه
        فقط در صندوق فروش دیده می‌شد.
        در چاپ، تب‌ها معنا ندارند؛ فقط مشخصات چاپ می‌شود.
      */}
      <Tabs defaultValue="info" className="print:hidden">
        <TabsList>
          <TabsTrigger value="info">مشخصات</TabsTrigger>
          <TabsTrigger value="stock">موجودی</TabsTrigger>
          <TabsTrigger value="kardex">کاردکس</TabsTrigger>
          <TabsTrigger value="prices">قیمت‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <ProductStock productId={product.id} />
        </TabsContent>

        <TabsContent value="kardex" className="mt-4">
          <ProductKardex productId={product.id} />
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          <ProductPrices productId={product.id} />
        </TabsContent>

        <TabsContent value="info" className="mt-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 print:hidden">
        {/* ستون چپ: عکس + آپلود */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card className="shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">تصویر محصول</CardTitle>
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="relative h-48 w-full overflow-hidden rounded-lg border bg-muted">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-10 w-10" />
                      <p className="text-sm">بدون تصویر</p>
                    </div>
                  )}
                </div>

                {canEdit ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={onFileChange}
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadM.isPending}
                    >
                      {uploadM.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {product.image ? "تغییر تصویر" : "آپلود تصویر"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      حداکثر ۵ مگابایت — فرمت‌های JPG, PNG, WebP
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    برای آپلود تصویر نیاز به دسترسی مدیر دارید.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* کارت وضعیت و تاریخ‌ها */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">وضعیت و زمان‌بندی</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <InfoRow
                  icon={Tag}
                  label="وضعیت"
                  value={
                    product.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        فعال
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-muted text-muted-foreground hover:bg-muted"
                      >
                        غیرفعال
                      </Badge>
                    )
                  }
                />
                <Separator />
                <InfoRow
                  icon={Calendar}
                  label="تاریخ ایجاد"
                  value={formatDateTime(product.createdAt)}
                />
                <Separator />
                <InfoRow
                  icon={Calendar}
                  label="آخرین به‌روزرسانی"
                  value={formatDateTime(product.updatedAt)}
                />
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <Button size="lg" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              ویرایش محصول
            </Button>
          ) : null}
        </div>

        {/* ستون راست: اطلاعات محصول */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* اطلاعات پایه */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">اطلاعات پایه</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
                <InfoRow icon={Package} label="نام" value={product.name} />
                <InfoRow
                  icon={Tag}
                  label="SKU"
                  value={<code className="text-xs">{product.sku}</code>}
                  mono
                />
                <InfoRow
                  icon={Barcode}
                  label="بارکد داخلی"
                  value={product.internalBarcode}
                  mono
                />
                <InfoRow
                  icon={Barcode}
                  label="بارکد کارخانه"
                  value={product.factoryBarcode}
                  mono
                />
                <InfoRow
                  icon={FileText}
                  label="شماره فنی"
                  value={product.partNumber}
                  mono
                />
                <InfoRow
                  icon={Scale}
                  label="واحد"
                  value={product.unit}
                />
                <InfoRow
                  icon={Scale}
                  label="وزن (kg)"
                  value={formatNumber(product.weight)}
                  mono
                />
              </div>
              {product.description ? (
                <>
                  <Separator className="my-3" />
                  <div>
                    <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      توضیحات
                    </p>
                    <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
                      {product.description}
                    </p>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* دسته‌بندی و ارتباطات */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">دسته‌بندی و ارتباطات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
                <InfoRow
                  icon={Boxes}
                  label="برند"
                  value={product.brand?.name ?? "—"}
                />
                <InfoRow
                  icon={Boxes}
                  label="مدل خودرو"
                  value={product.vehicleModel?.name ?? "—"}
                />
                <InfoRow
                  icon={Tag}
                  label="دسته‌بندی"
                  value={product.category?.name ?? product.categoryId ?? "—"}
                />
                <InfoRow
                  icon={Tag}
                  label="تامین‌کننده"
                  value={product.supplierId ?? "—"}
                />
              </div>
            </CardContent>
          </Card>

          {/* قیمت‌ها و موجودی */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">قیمت‌ها و موجودی</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
                <InfoRow
                  icon={Banknote}
                  label="قیمت خرید"
                  value={formatPrice(product.purchasePrice)}
                  mono
                />
                <InfoRow
                  icon={Banknote}
                  label="قیمت فروش"
                  value={formatPrice(product.salePrice)}
                  mono
                />
                <InfoRow
                  icon={Banknote}
                  label="قیمت عمده"
                  value={formatPrice(product.wholesalePrice)}
                  mono
                />
                <InfoRow
                  icon={Boxes}
                  label="حداقل موجودی"
                  value={formatNumber(product.minStock)}
                  mono
                />
              </div>
            </CardContent>
          </Card>

          {/* شناسه‌ها */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">شناسه‌های سیستم</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-sm text-muted-foreground">ID</span>
                  <code className="text-xs text-muted-foreground">
                    {product.id}
                  </code>
                </div>
                {product.brandId ? (
                  <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <span className="text-sm text-muted-foreground">
                      Brand ID
                    </span>
                    <code className="text-xs text-muted-foreground">
                      {product.brandId}
                    </code>
                  </div>
                ) : null}
                {product.vehicleModelId ? (
                  <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <span className="text-sm text-muted-foreground">
                      Vehicle Model ID
                    </span>
                    <code className="text-xs text-muted-foreground">
                      {product.vehicleModelId}
                    </code>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* بارکدها — چسباندنِ بارکدِ خودِ جنس، تا کالا بدون چاپ برچسب اسکن شود. */}
          <ProductBarcodes product={product} />
        </div>
      </div>

        </TabsContent>
      </Tabs>

      {/* دیالوگ ویرایش */}
      <ProductFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={product}
      />

      {/* دیالوگ چاپ لیبل محصول — طبق بخش الف سند افزونه */}
      <LabelPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        mode="product"
        ids={[product.id]}
      />
    </div>
  );
}
