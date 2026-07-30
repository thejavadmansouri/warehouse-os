"use client";

// صفحه‌ی انواع موقعیت — طبق بخش ۶.۶ سند
// نمایش جدولی انواع موقعیت + ایجاد نوع جدید با ۵ سطح مجاز (WAREHOUSE, ZONE, RACK, SHELF, BIN)

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Layers,
  Plus,
  Warehouse,
  LayoutGrid,
  BookOpen,
  Package,
} from "lucide-react";
// طبق بخش ۶.۶ سند — endpointهای انواع موقعیت
import { getLocationTypes, createLocationType } from "@/lib/api";
import type {
  LocationLevel,
  CreateLocationTypeDto,
} from "@/lib/types";
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
import { cn } from "@/lib/utils";

// ۵ مقدار مجاز level — طبق بخش ۶.۶ سند (هیچ مقدار دیگری نباید ارسال شود)
const LEVEL_OPTIONS: {
  value: LocationLevel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
}[] = [
  {
    value: "WAREHOUSE",
    label: "انبار",
    icon: Warehouse,
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  {
    value: "ZONE",
    label: "منطقه",
    icon: LayoutGrid,
    badgeClass:
      "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  },
  {
    value: "RACK",
    label: "قفسه",
    icon: BookOpen,
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  },
  {
    value: "SHELF",
    label: "طبقه",
    icon: Layers,
    badgeClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  },
  {
    value: "BIN",
    label: "جایگاه",
    icon: Package,
    badgeClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  },
];

function getLevelOption(level?: string | null) {
  return LEVEL_OPTIONS.find((o) => o.value === level);
}

// فرم — طبق POST /location-types (بخش ۶.۶)
const LEVEL_VALUES: LocationLevel[] = [
  "WAREHOUSE",
  "ZONE",
  "RACK",
  "SHELF",
  "BIN",
];
const formSchema = z.object({
  name: z.string().min(1, "نام نوع موقعیت الزامی است"),
  level: z
    .string()
    .min(1, "انتخاب سطح الزامی است")
    .refine(
      (v): v is LocationLevel =>
        LEVEL_VALUES.includes(v as LocationLevel),
      "سطح انتخاب‌شده نامعتبر است"
    ),
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

export default function LocationTypesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);

  // طبق بخش ۶.۶ سند — کلید کوئری: ["location-types"]
  const typesQ = useQuery({
    queryKey: ["location-types"],
    queryFn: () => getLocationTypes(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", level: undefined },
  });

  React.useEffect(() => {
    if (open) form.reset({ name: "", level: undefined });
  }, [open, form]);

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
    // فقط یکی از ۵ مقدار مجاز ارسال می‌شود
    createMutation.mutate({
      name: values.name,
      level: values.level as LocationLevel,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="انواع موقعیت"
        description="مدیریت طبقه‌بندی موقعیت‌ها بر اساس سطح (انبار، منطقه، قفسه، طبقه، جایگاه)"
        icon={Layers}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            نوع جدید
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">فهرست انواع موقعیت</CardTitle>
          <Badge variant="secondary">{typesQ.data?.length ?? 0} نوع</Badge>
        </CardHeader>
        <CardContent>
          {typesQ.isLoading ? (
            <TableSkeleton />
          ) : typesQ.isError ? (
            <ErrorState
              message="بارگذاری انواع موقعیت ناموفق بود"
              onRetry={() => typesQ.refetch()}
            />
          ) : !typesQ.data?.length ? (
            <EmptyState
              title="نوع موقعیتی ثبت نشده"
              description="برای شروع یک نوع با سطح مشخص بسازید."
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
                  <TableHead className="w-[40%]">نام</TableHead>
                  <TableHead>سطح</TableHead>
                  <TableHead>تاریخ ایجاد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typesQ.data.map((t) => {
                  const opt = getLevelOption(t.level);
                  const Icon = opt?.icon ?? Layers;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        {opt ? (
                          <Badge
                            className={cn("gap-1 text-[11px]", opt.badgeClass)}
                          >
                            <Icon className="h-3 w-3" />
                            {opt.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t.level}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              یک نوع جدید برای موقعیت‌ها با سطح مشخص بسازید.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نام نوع</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="مثلاً: انبار اصلی، منطقه شمال، قفسه A1..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>سطح</FormLabel>
                    <Select
                      dir="rtl"
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="سطح را انتخاب کنید..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            <span className="flex items-center gap-2">
                              <o.icon className="h-4 w-4" />
                              {o.label}
                              <span className="text-xs text-muted-foreground">
                                ({o.value})
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      ۵ سطح مجاز: انبار، منطقه، قفسه، طبقه، جایگاه
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
