"use client";

// صفحه‌ی مدیریت مدل‌های خودرو — طبق بخش ۶.۵ سند
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Car, Loader2 } from "lucide-react";

import { getVehicleModels, createVehicleModel } from "@/lib/api";
import type { VehicleModel } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

// اسکیمای فرم مدل خودرو — طبق بخش ۶.۵ سند
// startYear و endYear عدد صحیح اجباری هستند؛ endYear باید >= startYear باشد
const vehicleModelSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "نام مدل الزامی است")
      .max(100, "نام مدل نمی‌تواند بیش از ۱۰۰ کاراکتر باشد"),
    startYear: z.coerce
      .number({ message: "سال شروع الزامی است" })
      .int("سال شروع باید عدد صحیح باشد")
      .min(1900, "سال شروع نمی‌تواند کمتر از ۱۹۰۰ باشد")
      .max(2100, "سال شروع نمی‌تواند بیشتر از ۲۱۰۰ باشد"),
    endYear: z.coerce
      .number({ message: "سال پایان الزامی است" })
      .int("سال پایان باید عدد صحیح باشد")
      .min(1900, "سال پایان نمی‌تواند کمتر از ۱۹۰۰ باشد")
      .max(2100, "سال پایان نمی‌تواند بیشتر از ۲۱۰۰ باشد"),
    systemType: z
      .string()
      .trim()
      .max(100, "نوع سیستم نمی‌تواند بیش از ۱۰۰ کاراکتر باشد")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.endYear >= data.startYear, {
    message: "سال پایان باید بزرگ‌تر یا مساوی سال شروع باشد",
    path: ["endYear"],
  });

type VehicleModelFormValues = z.infer<typeof vehicleModelSchema>;

// مرتب‌سازی آرایه بر اساس name (دفاعی — بک‌اند هم طبق سند مرتب برمی‌گرداند)
function sortByName(items: VehicleModel[]): VehicleModel[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, "fa")
  );
}

/** داخلِ صفحه‌ی میزبان سرتیترِ خودش را نشان نمی‌دهد. */
export function VehicleModelsPanel({ embedded }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [dupError, setDupError] = React.useState<string | null>(null);

  // لیست مدل‌های خودرو — کلید query: ["vehicle-models"]
  const {
    data: vehicleModels,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<VehicleModel[]>({
    queryKey: ["vehicle-models"],
    queryFn: getVehicleModels,
    select: sortByName,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<
    z.input<typeof vehicleModelSchema>,
    unknown,
    z.output<typeof vehicleModelSchema>
  >({
    resolver: zodResolver(vehicleModelSchema),
    defaultValues: {
      name: "",
      startYear: undefined,
      endYear: undefined,
      systemType: "",
    },
  });

  // ایجاد مدل خودروی جدید — طبق بخش ۶.۵ سند
  const createMutation = useMutation({
    mutationFn: (dto: {
      name: string;
      startYear: number;
      endYear: number;
      systemType?: string;
    }) => createVehicleModel(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-models"] });
      toast({
        title: "مدل خودرو ثبت شد",
        description: "مدل خودرو با موفقیت در سیستم ثبت شد.",
      });
      setOpen(false);
      reset({
        name: "",
        startYear: undefined,
        endYear: undefined,
        systemType: "",
      });
      setDupError(null);
    },
    onError: (e: unknown) => {
      const message =
        e instanceof ApiException
          ? e.message
          : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.";
      toast({
        title: "خطا در ثبت مدل خودرو",
        description: message,
        variant: "destructive",
      });
    },
  });

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      reset({
        name: "",
        startYear: undefined,
        endYear: undefined,
        systemType: "",
      });
      setDupError(null);
    }
  };

  const onSubmit = (values: VehicleModelFormValues) => {
    setDupError(null);
    const name = values.name.trim();
    const startYear = Number(values.startYear);
    const endYear = Number(values.endYear);
    const systemType = values.systemType?.trim()
      ? values.systemType.trim()
      : undefined;

    // ترکیب (name, startYear, endYear) باید یکتا باشد (@@unique)
    // چک نرم سمت کلاینت تا از خطای ۵۰۰ Prisma جلوگیری شود
    const exists = (vehicleModels ?? []).some(
      (m) =>
        m.name.trim().toLowerCase() === name.toLowerCase() &&
        Number(m.startYear) === startYear &&
        Number(m.endYear) === endYear
    );
    if (exists) {
      setDupError("این ترکیب نام/سال‌ها قبلاً ثبت شده");
      return;
    }

    createMutation.mutate({ name, startYear, endYear, systemType });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact={embedded}
        title="مدیریت مدل‌های خودرو"
        description="لیست مدل خودروهای ثبت‌شده برای تطبیق با قطعات"
        icon={Car}
        actions={
          <Button onClick={() => setOpen(true)} disabled={isLoading}>
            <Plus className="ms-2 h-4 w-4" />
            مدل جدید
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState label="در حال بارگذاری مدل‌ها..." />
          ) : isError ? (
            <ErrorState
              message={
                error instanceof ApiException
                  ? error.message
                  : "خطا در بارگذاری مدل‌ها"
              }
              onRetry={() => refetch()}
            />
          ) : !vehicleModels || vehicleModels.length === 0 ? (
            <EmptyState
              title="مدلی ثبت نشده"
              description="برای شروع، اولین مدل خودرو را اضافه کنید."
              icon={Car}
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="ms-2 h-4 w-4" />
                  افزودن مدل
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
                    <TableHead>نام مدل</TableHead>
                    <TableHead className="text-center">سال شروع</TableHead>
                    <TableHead className="text-center">سال پایان</TableHead>
                    <TableHead>نوع سیستم</TableHead>
                    <TableHead>تاریخ ایجاد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleModels.map((model, idx) => (
                    <TableRow key={model.id}>
                      <TableCell className="text-center text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">{model.name}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {model.startYear}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {model.endYear}
                      </TableCell>
                      <TableCell>
                        {model.systemType ? (
                          <Badge variant="secondary">
                            {model.systemType}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(model.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ ایجاد مدل خودروی جدید */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>مدل خودرو جدید</DialogTitle>
            <DialogDescription>
              مشخصات مدل خودرو را وارد کنید.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="vm-name">نام مدل</Label>
              <Input
                id="vm-name"
                placeholder="مثلاً: پژو ۲۰۶، تویوتا کرولا..."
                autoFocus
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="vm-startYear">سال شروع</Label>
                <Input
                  id="vm-startYear"
                  type="number"
                  inputMode="numeric"
                  placeholder="مثلاً: ۱۳۸۰"
                  {...register("startYear")}
                />
                {errors.startYear ? (
                  <p className="text-xs text-destructive">
                    {errors.startYear.message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="vm-endYear">سال پایان</Label>
                <Input
                  id="vm-endYear"
                  type="number"
                  inputMode="numeric"
                  placeholder="مثلاً: ۱۴۰۰"
                  {...register("endYear")}
                />
                {errors.endYear ? (
                  <p className="text-xs text-destructive">
                    {errors.endYear.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="vm-systemType">
                نوع سیستم{" "}
                <span className="text-xs text-muted-foreground">(اختیاری)</span>
              </Label>
              <Input
                id="vm-systemType"
                placeholder="مثلاً: دنده‌ای، اتوماتیک، هایبرید..."
                {...register("systemType")}
              />
              {errors.systemType ? (
                <p className="text-xs text-destructive">
                  {errors.systemType.message}
                </p>
              ) : null}
            </div>

            {dupError ? (
              <Alert variant="destructive">
                <AlertDescription>{dupError}</AlertDescription>
              </Alert>
            ) : null}

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
                  "ثبت مدل"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function VehicleModelsPage() {
  return <VehicleModelsPanel />;
}
