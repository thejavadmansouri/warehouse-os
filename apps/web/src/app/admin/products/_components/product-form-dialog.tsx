"use client";

// فرم ایجاد/ویرایش محصول — طبق بخش ۶.۳ سند
// شامل تمام فیلدهای CreateProductDto با اعتبارسنجی zod
// عکس محصول از طریق صفحه جزئیات و endpoint جداگانه آپلود می‌شود
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImageIcon, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

import {
  createProduct,
  uploadProductImage,
  updateProduct,
  getBrands,
  getVehicleModels,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { useToast } from "@/hooks/use-toast";
import type { Product, CreateProductDto, UpdateProductDto } from "@/lib/types";

import { unitLabel } from "@/lib/currency";
// عدد اختیاری — رشته خالی → undefined، در غیر این صورت عدد
const optionalNumber = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  },
  z.number().optional()
);

const productSchema = z.object({
  name: z.string().min(1, "نام محصول الزامی است"),
  sku: z.string().min(1, "کد SKU الزامی است"),
  internalBarcode: z.string().optional(),
  factoryBarcode: z.string().optional(),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  weight: optionalNumber,
  brandId: z.string().optional(),
  vehicleModelId: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  purchasePrice: optionalNumber,
  salePrice: optionalNumber,
  wholesalePrice: optionalNumber,
  minStock: optionalNumber,
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof productSchema>;

function emptyToUndefined(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initial?: Product;
  onSuccess?: (p: Product) => void;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSuccess,
}: ProductFormDialogProps) {
  const isEdit = mode === "edit";
  const { toast } = useToast();
  const qc = useQueryClient();

  // طبق بخش ۶.۴ — GET /brands (فقط هنگام باز بودن دیالوگ)
  const brandsQ = useQuery({
    queryKey: ["brands"],
    queryFn: () => getBrands(),
    enabled: open,
    staleTime: 60_000,
  });

  // طبق بخش ۶.۵ — GET /vehicle-models
  const modelsQ = useQuery({
    queryKey: ["vehicle-models"],
    queryFn: () => getVehicleModels(),
    enabled: open,
    staleTime: 60_000,
  });

  const defaults: FormValues = React.useMemo(
    () => ({
      name: "",
      sku: "",
      internalBarcode: "",
      factoryBarcode: "",
      partNumber: "",
      description: "",
      unit: "",
      weight: undefined,
      brandId: undefined,
      vehicleModelId: undefined,
      categoryId: "",
      supplierId: "",
      purchasePrice: undefined,
      salePrice: undefined,
      wholesalePrice: undefined,
      minStock: undefined,
      isActive: true,
    }),
    []
  );

  // مقادیر اولیه برای حالت ویرایش — memoize تا reset اضافی رخ ندهد
  const editValues: FormValues = React.useMemo(
    () =>
      isEdit && initial
        ? {
            name: initial.name ?? "",
            sku: initial.sku ?? "",
            internalBarcode: initial.internalBarcode ?? "",
            factoryBarcode: initial.factoryBarcode ?? "",
            partNumber: initial.partNumber ?? "",
            description: initial.description ?? "",
            unit: initial.unit ?? "",
            weight: initial.weight ?? undefined,
            brandId: initial.brandId ?? undefined,
            vehicleModelId: initial.vehicleModelId ?? undefined,
            categoryId: initial.categoryId ?? "",
            supplierId: initial.supplierId ?? "",
            purchasePrice: initial.purchasePrice ?? undefined,
            salePrice: initial.salePrice ?? undefined,
            wholesalePrice: initial.wholesalePrice ?? undefined,
            minStock: initial.minStock ?? undefined,
            isActive: initial.isActive ?? true,
          }
        : defaults,
    [isEdit, initial, defaults]
  );

  const form = useForm<
    z.input<typeof productSchema>,
    unknown,
    z.output<typeof productSchema>
  >({
    resolver: zodResolver(productSchema),
    defaultValues: defaults,
    values: editValues,
    mode: "onSubmit",
  });

  // ریست صریح هنگام باز/بسته شدن دیالوگ
  React.useEffect(() => {
    if (!open) return;
    form.reset(editValues);
  }, [open, editValues, form]);

  /*
   * عکس تا وقتی کالا شناسه نگرفته نمی‌تواند آپلود شود — اندپوینتش روی
   * `/uploads/product/:id/image` است. پس فایل اینجا نگه داشته می‌شود و بعد از
   * ساختِ موفقِ کالا فرستاده می‌شود.
   *
   * تا امروز اصلاً همین فیلد نبود: موقع ساختِ کالا هیچ راهی برای گذاشتنِ عکس
   * وجود نداشت و باید ذخیره می‌کردی، کالا را باز می‌کردی، و آنجا عکس می‌زدی.
   */
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setImageFile(null);
      setImagePreview(null);
    }
  }, [open]);

  const pickImage = (file: File | null) => {
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  /**
   * عکس را می‌فرستد و دیالوگ را می‌بندد.
   *
   * اگر آپلود شکست بخورد، کالا **ساخته شده باقی می‌ماند** — و همین به کاربر
   * گفته می‌شود. بستنِ بی‌صدا یعنی او فکر می‌کند عکس رفته.
   */
  const finish = async (p: Product) => {
    if (imageFile) {
      try {
        await uploadProductImage(p.id, imageFile);
      } catch (e) {
        toast({
          title: "کالا ساخته شد ولی عکس آپلود نشد",
          description:
            e instanceof ApiException ? e.message : "از صفحه‌ی کالا دوباره تلاش کنید",
          variant: "destructive",
        });
      }
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    if (p.id) qc.invalidateQueries({ queryKey: ["product", p.id] });
    onOpenChange(false);
    onSuccess?.(p);
  };

  // طبق بخش ۶.۳ — POST /products
  const createM = useMutation({
    mutationFn: (dto: CreateProductDto) => createProduct(dto),
    onSuccess: (p) => {
      toast({ title: "محصول ایجاد شد", description: p.name });
      void finish(p);
    },
    onError: (e) => {
      toast({
        title: "خطا در ایجاد محصول",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
        variant: "destructive",
      });
    },
  });

  // طبق بخش ۶.۳ — PATCH /products/:id
  const updateM = useMutation({
    mutationFn: (dto: UpdateProductDto) =>
      updateProduct((initial as Product).id, dto),
    onSuccess: (p) => {
      toast({ title: "محصول به‌روزرسانی شد", description: p.name });
      void finish(p);
    },
    onError: (e) => {
      toast({
        title: "خطا در به‌روزرسانی",
        description: e instanceof ApiException ? e.message : "خطای غیرمنتظره",
        variant: "destructive",
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const dto: CreateProductDto = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      internalBarcode: emptyToUndefined(values.internalBarcode),
      factoryBarcode: emptyToUndefined(values.factoryBarcode),
      partNumber: emptyToUndefined(values.partNumber),
      description: emptyToUndefined(values.description),
      unit: emptyToUndefined(values.unit),
      weight: values.weight ?? undefined,
      brandId: values.brandId || undefined,
      vehicleModelId: values.vehicleModelId || undefined,
      categoryId: emptyToUndefined(values.categoryId),
      supplierId: emptyToUndefined(values.supplierId),
      purchasePrice: values.purchasePrice ?? undefined,
      salePrice: values.salePrice ?? undefined,
      wholesalePrice: values.wholesalePrice ?? undefined,
      minStock: values.minStock ?? undefined,
      isActive: values.isActive,
    };
    if (isEdit) {
      updateM.mutate(dto);
    } else {
      createM.mutate(dto);
    }
  });

  const loading = createM.isPending || updateM.isPending;

  // کمک‌کننده برای فیلدهای عددی — رشته خالی → undefined، در غیر این صورت عدد.
  // فیلد از نوع ورودی فرم است (z.input) که مقادیر عددی در آن قبل از preprocess
  // به‌صورت unknown‌اند؛ پس همان نوع را می‌پذیریم نه خروجی نهایی.
  type FormInput = z.input<typeof productSchema>;
  const numberFieldProps = (
    field: ControllerRenderProps<FormInput, keyof FormInput>
  ) => ({
    type: "number" as const,
    value: (field.value as number | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      field.onChange(v === "" ? undefined : Number(v));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>{isEdit ? "ویرایش محصول" : "محصول جدید"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "اطلاعات محصول را ویرایش کنید و سپس ذخیره را بزنید."
              : "فرم زیر را برای ایجاد محصول جدید پر کنید."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={onSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-6 py-5">
              {/* عکس — بین ۳۳ هزار قطعه‌ی شبیه هم، سریع‌ترین راه تشخیص. */}
              <div className="mb-4 flex items-center gap-4 rounded-lg border p-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-7 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                    className="cursor-pointer"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    اختیاری — بعد از ثبت کالا آپلود می‌شود. حداکثر ۵ مگابایت.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* نام محصول */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>
                        نام محصول <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="مثلاً: فیلتر روغن پراید"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* SKU */}
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        کد SKU <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="FL-PR-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* شماره فنی */}
                <FormField
                  control={form.control}
                  name="partNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>شماره فنی</FormLabel>
                      <FormControl>
                        <Input placeholder="OEM-12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* بارکد داخلی */}
                <FormField
                  control={form.control}
                  name="internalBarcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>بارکد داخلی</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="6290000000000"
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* بارکد کارخانه */}
                <FormField
                  control={form.control}
                  name="factoryBarcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>بارکد کارخانه</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="OEM-BARCODE"
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* برند */}
                <FormField
                  control={form.control}
                  name="brandId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>برند</FormLabel>
                      <Select
                        dir="rtl"
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange(v === "__none" ? "" : v)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="انتخاب برند" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none">— بدون برند —</SelectItem>
                          {brandsQ.isLoading ? (
                            <SelectItem value="__loading" disabled>
                              در حال بارگذاری...
                            </SelectItem>
                          ) : null}
                          {brandsQ.data?.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* مدل خودرو */}
                <FormField
                  control={form.control}
                  name="vehicleModelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>مدل خودرو</FormLabel>
                      <Select
                        dir="rtl"
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange(v === "__none" ? "" : v)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="انتخاب مدل خودرو" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none">— بدون مدل —</SelectItem>
                          {modelsQ.isLoading ? (
                            <SelectItem value="__loading" disabled>
                              در حال بارگذاری...
                            </SelectItem>
                          ) : null}
                          {modelsQ.data?.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                              {m.startYear && m.endYear
                                ? ` (${m.startYear}-${m.endYear})`
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* دسته‌بندی (متن خام) */}
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>شناسه دسته‌بندی</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="اختیاری — شناسه دسته"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* تامین‌کننده (متن خام) */}
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>شناسه تامین‌کننده</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="اختیاری — شناسه تامین‌کننده"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* واحد */}
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>واحد شمارش</FormLabel>
                      <FormControl>
                        <Input placeholder="عدد / جعبه / متر" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* وزن */}
                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>وزن (کیلوگرم)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0.5"
                          step="0.01"
                          min="0"
                          {...numberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* حداقل موجودی */}
                <FormField
                  control={form.control}
                  name="minStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>حداقل موجودی</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="10"
                          min="0"
                          {...numberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* قیمت خرید */}
                <FormField
                  control={form.control}
                  name="purchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>قیمت خرید ({unitLabel()})</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          min="0"
                          {...numberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* قیمت فروش */}
                <FormField
                  control={form.control}
                  name="salePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>قیمت فروش ({unitLabel()})</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          min="0"
                          {...numberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* قیمت عمده */}
                <FormField
                  control={form.control}
                  name="wholesalePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>قیمت عمده‌فروشی ({unitLabel()})</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          min="0"
                          {...numberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* توضیحات */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>توضیحات</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="توضیحات اختیاری درباره محصول..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="sm:col-span-2" />

                {/* وضعیت فعال */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label htmlFor="isActive-switch">
                            محصول فعال است
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            محصولات غیرفعال در جستجو و فروش نمایش داده نمی‌شوند.
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            id="isActive-switch"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t p-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                انصراف
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {isEdit ? "ذخیره تغییرات" : "ایجاد محصول"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
