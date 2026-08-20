"use client";

// صفحه‌ی انواع موقعیت
// نمایش جدولی انواع موقعیت (هر انبار سطوح خودش را دارد) + ایجاد نوع جدید.
// مدل واقعی بک‌اند: هر LocationType به یک انبار تعلق دارد و با name + depth
// (عدد عمق، نه یک enum ثابت) تعریف می‌شود — طبق Prisma schema و location-types.service.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layers, Plus } from "lucide-react";
import {
  getLocationTypes,
  createLocationType,
  getWarehouses,
} from "@/lib/api";
import type { CreateLocationTypeDto } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ApiException } from "@/lib/api-error-messages";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import { PageHeader } from "@/components/page-header";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

const formSchema = z.object({
  warehouseId: z.string().min(1, "انتخاب انبار الزامی است"),
  name: z.string().min(1, "نام نوع موقعیت الزامی است"),
  depth: z.coerce
    .number({ message: "عمق باید عدد باشد" })
    .int("عمق باید عدد صحیح باشد")
    .min(0, "عمق نمی‌تواند منفی باشد"),
});

type FormValues = z.infer<typeof formSchema>;

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

/** داخلِ صفحه‌ی میزبان سرتیترِ خودش را نشان نمی‌دهد. */
export function LocationTypesPanel({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [warehouseFilter, setWarehouseFilter] = React.useState<string>("all");

  const warehousesQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => getWarehouses(),
  });
  const warehouses = warehousesQ.data ?? [];
  const warehouseName = (id: string) =>
    warehouses.find((w) => w.id === id)?.name ?? id;

  const typesQ = useQuery({
    queryKey: ["location-types", warehouseFilter],
    queryFn: () =>
      getLocationTypes(warehouseFilter === "all" ? undefined : warehouseFilter),
  });

  const form = useForm<
    z.input<typeof formSchema>,
    unknown,
    z.output<typeof formSchema>
  >({
    resolver: zodResolver(formSchema),
    defaultValues: { warehouseId: "", name: "", depth: 0 },
  });

  // کمک‌کننده برای فیلد عددی — رشته خالی → undefined، در غیر این صورت عدد.
  type FormInput = z.input<typeof formSchema>;
  const depthFieldProps = (
    field: ControllerRenderProps<FormInput, "depth">
  ) => ({
    type: "number" as const,
    value: (field.value as number | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      field.onChange(v === "" ? undefined : Number(v));
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        warehouseId: warehouseFilter !== "all" ? warehouseFilter : "",
        name: "",
        depth: 0,
      });
    }
  }, [open, form, warehouseFilter]);

  const createMutation = useMutation({
    mutationFn: (dto: CreateLocationTypeDto) => createLocationType(dto),
    onSuccess: () => {
      toast({ title: "نوع موقعیت جدید ایجاد شد" });
      qc.invalidateQueries({ queryKey: ["location-types"] });
      setOpen(false);
    },
    onError: (e) => {
      const msg =
        e instanceof ApiException ? e.message : "ایجاد نوع موقعیت ناموفق بود";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      warehouseId: values.warehouseId,
      name: values.name,
      depth: values.depth,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact={embedded}
        title="انواع موقعیت"
        description="تعریف سطوح موقعیت هر انبار (مثلاً طبقه، ردیف، ستون، باکس) با ترتیب عمق"
        icon={Layers}
        actions={
          <Button onClick={() => setOpen(true)} disabled={warehouses.length === 0}>
            <Plus className="h-4 w-4" />
            نوع جدید
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
          <CardTitle className="text-base">فهرست انواع موقعیت</CardTitle>
          <div className="flex items-center gap-2">
            {warehouses.length > 0 ? (
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="همه‌ی انبارها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه‌ی انبارها</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Badge variant="secondary">{typesQ.data?.length ?? 0} نوع</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {warehousesQ.isSuccess && warehouses.length === 0 ? (
            <EmptyState
              title="هیچ انباری ثبت نشده"
              description="برای ساخت نوع موقعیت، ابتدا باید حداقل یک انبار در سیستم وجود داشته باشد."
              icon={Layers}
            />
          ) : typesQ.isLoading ? (
            <TableSkeleton />
          ) : typesQ.isError ? (
            <ErrorState
              message="بارگذاری انواع موقعیت ناموفق بود"
              onRetry={() => typesQ.refetch()}
            />
          ) : !typesQ.data?.length ? (
            <EmptyState
              title="نوع موقعیتی ثبت نشده"
              description="برای شروع یک نوع با عمق مشخص بسازید."
              icon={Layers}
              action={
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" />
                  نوع جدید
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">نام</TableHead>
                  <TableHead>عمق</TableHead>
                  {warehouseFilter === "all" ? <TableHead>انبار</TableHead> : null}
                  <TableHead>تاریخ ایجاد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...typesQ.data]
                  .sort((a, b) => a.depth - b.depth)
                  .map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {t.depth}
                        </Badge>
                      </TableCell>
                      {warehouseFilter === "all" ? (
                        <TableCell className="text-sm text-muted-foreground">
                          {warehouseName(t.warehouseId)}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ ایجاد نوع جدید */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>نوع موقعیت جدید</DialogTitle>
            <DialogDescription>
              یک سطح جدید برای موقعیت‌های یک انبار مشخص بسازید — مثلاً «طبقه» با
              عمق ۰، «ردیف» با عمق ۱، «ستون» با عمق ۲، «باکس» با عمق ۳.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>انبار</FormLabel>
                    <Select
                      dir="rtl"
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="انبار را انتخاب کنید..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نام نوع</FormLabel>
                    <FormControl>
                      <Input placeholder="مثلاً: طبقه، ردیف، ستون، باکس" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="depth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>عمق</FormLabel>
                    <FormControl>
                      <Input min={0} step={1} {...depthFieldProps(field)} />
                    </FormControl>
                    <FormDescription>
                      ترتیب سطح در سلسله‌مراتب زیر انبار — ۰ بالاترین سطح
                      (نزدیک‌تر به انبار)، هر سطح پایین‌تر عدد بزرگ‌تر می‌گیرد.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={createMutation.isPending}
                >
                  انصراف
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "در حال ایجاد..." : "ایجاد نوع"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function LocationTypesPage() {
  return <LocationTypesPanel />;
}
