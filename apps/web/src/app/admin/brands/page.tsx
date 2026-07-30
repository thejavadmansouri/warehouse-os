"use client";

// صفحه‌ی مدیریت برندها — طبق بخش ۶.۴ سند
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Tags, Loader2 } from "lucide-react";

import { getBrands, createBrand } from "@/lib/api";
import type { Brand } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Card,
  CardContent,
} from "@/components/ui/card";

// اسکیمای فرم برند — فقط نام ذخیره می‌شود (طبق بخش ۶.۴ سند)
const brandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "نام برند الزامی است")
    .max(100, "نام برند نمی‌تواند بیش از ۱۰۰ کاراکتر باشد"),
});

type BrandFormValues = z.infer<typeof brandSchema>;

export default function BrandsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [dupError, setDupError] = React.useState<string | null>(null);

  // لیست برندها — کلید query: ["brands"]
  const {
    data: brands,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Brand[]>({
    queryKey: ["brands"],
    queryFn: getBrands,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BrandFormValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: "" },
  });

  // ایجاد برند جدید — طبق بخش ۶.۴ سند
  const createMutation = useMutation({
    mutationFn: (name: string) => createBrand(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast({
        title: "برند جدید ثبت شد",
        description: "برند با موفقیت در سیستم ثبت شد.",
      });
      setOpen(false);
      reset({ name: "" });
      setDupError(null);
    },
    onError: (e: unknown) => {
      const message =
        e instanceof ApiException
          ? e.message
          : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.";
      toast({
        title: "خطا در ثبت برند",
        description: message,
        variant: "destructive",
      });
    },
  });

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      reset({ name: "" });
      setDupError(null);
    }
  };

  const onSubmit = (values: BrandFormValues) => {
    setDupError(null);
    const trimmed = values.name.trim();

    // بررسی تکراری نبودن نام — name روی دیتابیس @unique است
    // چک سمت کلاینت تا از خطای ۵۰۰ Prisma جلوگیری شود
    const exists = (brands ?? []).some(
      (b) => b.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setDupError("این برند قبلاً ثبت شده");
      return;
    }

    createMutation.mutate(trimmed);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="مدیریت برندها"
        description="لیست برندهای قطعات و لوازم یدکی ثبت‌شده در سیستم"
        icon={Tags}
        actions={
          <Button onClick={() => setOpen(true)} disabled={isLoading}>
            <Plus className="ms-2 h-4 w-4" />
            برند جدید
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState label="در حال بارگذاری برندها..." />
          ) : isError ? (
            <ErrorState
              message={
                error instanceof ApiException
                  ? error.message
                  : "خطا در بارگذاری برندها"
              }
              onRetry={() => refetch()}
            />
          ) : !brands || brands.length === 0 ? (
            <EmptyState
              title="برندی ثبت نشده"
              description="برای شروع، اولین برند قطعات خود را اضافه کنید."
              icon={Tags}
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="ms-2 h-4 w-4" />
                  افزودن برند
                </Button>
              }
            />
          ) : (
            <>
              {isFetching ? (
                <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  در حال به‌روزرسانی...
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">#</TableHead>
                    <TableHead>نام برند</TableHead>
                    <TableHead>تاریخ ایجاد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((brand, idx) => (
                    <TableRow key={brand.id}>
                      <TableCell className="text-center text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">{brand.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(brand.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ ایجاد برند جدید */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>برند جدید</DialogTitle>
            <DialogDescription>
              نام برند قطعات یا لوازم یدکی را وارد کنید.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="brand-name">نام برند</Label>
              <Input
                id="brand-name"
                placeholder="مثلاً: تویوتا، بنز، پژو..."
                autoFocus
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
              {dupError ? (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">
                    {dupError}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              در حال حاضر فقط نام برند ذخیره می‌شود؛ نام مستعار پشتیبانی نمی‌شود.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending}
              >
                انصراف
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                    در حال ثبت...
                  </>
                ) : (
                  "ثبت برند"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
