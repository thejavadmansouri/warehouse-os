"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  ClipboardList,
  AlertCircle,
  Plus,
  CheckCircle2,
  PlayCircle,
  Mic,
} from "lucide-react";

import {
  addInventoryCountItem,
  applyInventoryCount,
  finishInventoryCount,
  getInventoryCount,
} from "@/lib/api";
import type {
  CreateInventoryCountItemDto,
  InventoryCount,
} from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProductSearchSelect } from "@/components/product-search-select";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ALLOWED_ITEMS: Array<"ADMIN" | "MANAGER" | "STAFF"> = [
  "ADMIN",
  "MANAGER",
  "STAFF",
];
const ALLOWED_APPLY: Array<"ADMIN" | "MANAGER"> = ["ADMIN", "MANAGER"];

export default function InventoryCountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const hasRole = useAuthStore((s) => s.hasRole);
  const canAddItems = hasRole(...ALLOWED_ITEMS);
  const canApply = hasRole(...ALLOWED_APPLY);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // طبق بخش ۶.۹ — GET /inventory-count/:id
  const countQ = useQuery({
    queryKey: ["inventory-count", id],
    queryFn: () => getInventoryCount(id),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  // ----- فرم افزودن آیتم -----
  const [itemForm, setItemForm] = React.useState<CreateInventoryCountItemDto>({
    name: "",
    goodQuantity: 0,
    badQuantity: 0,
    note: "",
    voiceText: "",
  });
  const [productId, setProductId] = React.useState<string>("");
  const [productLabel, setProductLabel] = React.useState<string>("");
  const [itemError, setItemError] = React.useState<string | null>(null);

  // ----- وضعیت دیالوگ‌ها -----
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);

  // ----- mutation‌ها -----
  // طبق بخش ۶.۹ — POST /inventory-count/:id/items
  const addItemMut = useMutation({
    mutationFn: (dto: CreateInventoryCountItemDto) =>
      addInventoryCountItem(id, dto),
    onSuccess: () => {
      toast({
        title: "آیتم اضافه شد",
        description: `"${itemForm.name}" به لیست شمارش اضافه شد.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory-count", id],
      });
      // پاک کردن فرم
      setItemForm({
        name: "",
        goodQuantity: 0,
        badQuantity: 0,
        note: "",
        voiceText: "",
      });
      setProductId("");
      setProductLabel("");
      setItemError(null);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException
          ? e.message
          : "افزودن آیتم ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // طبق بخش ۶.۹ — PATCH /inventory-count/:id/finish
  const finishMut = useMutation({
    mutationFn: () => finishInventoryCount(id),
    onSuccess: () => {
      toast({
        title: "شمارش پایان یافت",
        description: "این جلسه انبارگردانی پایان یافت.",
      });
      setFinishOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["inventory-count", id],
      });
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException
          ? e.message
          : "پایان شمارش ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // طبق بخش ۶.۹ — POST /inventory-count/:id/apply
  const applyMut = useMutation({
    mutationFn: () => applyInventoryCount(id),
    onSuccess: () => {
      toast({
        title: "اعمال شد",
        description:
          "موجودی واقعی با نتیجه‌ی انبارگردانی به‌روزرسانی شد.",
      });
      setApplyOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["inventory-count", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "current-stock"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "logs"] });
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException
          ? e.message
          : "اعمال انبارگردانی ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleAddItem = () => {
    if (!itemForm.name.trim()) {
      setItemError("نام آیتم اجباری است.");
      return;
    }
    const good = Number(itemForm.goodQuantity ?? 0);
    const bad = Number(itemForm.badQuantity ?? 0);
    if (good < 0 || bad < 0) {
      setItemError("مقادیر تعداد نمی‌توانند منفی باشند.");
      return;
    }
    setItemError(null);
    const dto: CreateInventoryCountItemDto = {
      name: itemForm.name.trim(),
      productId: productId || undefined,
      goodQuantity: good,
      badQuantity: bad,
      note: itemForm.note?.trim() || undefined,
      voiceText: itemForm.voiceText?.trim() || undefined,
    };
    addItemMut.mutate(dto);
  };

  if (!id) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="جزئیات انبارگردانی" icon={ClipboardList} />
        <ErrorState message="شناسه انبارگردانی نامعتبر است." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="جزئیات انبارگردانی"
        description={`شناسه: ${id}`}
        icon={ClipboardList}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFinishOpen(true)}
              disabled={
                countQ.data?.status === "FINISHED" ||
                finishMut.isPending
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              پایان شمارش
            </Button>
            {canApply ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setApplyOpen(true)}
                disabled={
                  countQ.data?.status === "APPLIED" ||
                  applyMut.isPending
                }
              >
                <PlayCircle className="h-4 w-4" />
                اعمال روی موجودی
              </Button>
            ) : null}
          </div>
        }
      />

      {countQ.isLoading ? (
        <LoadingState label="در حال بارگذاری انبارگردانی..." />
      ) : countQ.isError ? (
        <ErrorState
          message="بارگذاری انبارگردانی ناموفق بود."
          onRetry={() => countQ.refetch()}
        />
      ) : (
        <CountView countQ={countQ} />
      )}

      {/* فرم افزودن آیتم — فقط در صورت مجاز بودن */}
      {canAddItems &&
      countQ.data?.status !== "FINISHED" &&
      countQ.data?.status !== "APPLIED" ? (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-accent" />
              افزودن آیتم
            </CardTitle>
            <CardDescription>
              یک قلم جدید به لیست شمارش اضافه کنید.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-name">
                  نام قلم <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="i-name"
                  value={itemForm.name ?? ""}
                  onChange={(e) =>
                    setItemForm((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="مثلاً: لنت ترمز جلو"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-product">محصول (اختیاری)</Label>
                <ProductSearchSelect
                  value={productId}
                  onChange={(p) => {
                    setProductId(p?.id ?? "");
                    setProductLabel(p?.name ?? "");
                    if (p?.name && !itemForm.name) {
                      setItemForm((s) => ({ ...s, name: p.name }));
                    }
                  }}
                  placeholder="جستجوی محصول..."
                />
                {productId ? (
                  <span className="text-xs text-muted-foreground">
                    انتخاب‌شده: {productLabel || productId}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-good">تعداد سالم</Label>
                <Input
                  id="i-good"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={itemForm.goodQuantity ?? 0}
                  onChange={(e) =>
                    setItemForm((s) => ({
                      ...s,
                      goodQuantity: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-bad">تعداد خراب</Label>
                <Input
                  id="i-bad"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={itemForm.badQuantity ?? 0}
                  onChange={(e) =>
                    setItemForm((s) => ({
                      ...s,
                      badQuantity: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="i-note">یادداشت (اختیاری)</Label>
                <Input
                  id="i-note"
                  value={itemForm.note ?? ""}
                  onChange={(e) =>
                    setItemForm((s) => ({ ...s, note: e.target.value }))
                  }
                  placeholder="توضیح کوتاه..."
                  maxLength={200}
                />
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="i-voice" className="flex items-center gap-1">
                  <Mic className="h-3.5 w-3.5" />
                  متن گفتار (اختیاری)
                </Label>
                <Textarea
                  id="i-voice"
                  value={itemForm.voiceText ?? ""}
                  onChange={(e) =>
                    setItemForm((s) => ({
                      ...s,
                      voiceText: e.target.value,
                    }))
                  }
                  placeholder="متن پیاده‌سازی‌شده‌ی گفتار..."
                  rows={2}
                />
              </div>

              {/* فیلدهای متنی اختیاری دسته/برند/مدل خودرو */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-cat">شناسه دسته (اختیاری)</Label>
                <Input
                  id="i-cat"
                  value={(itemForm as CreateInventoryCountItemDto).categoryId ?? ""}
                  onChange={(e) =>
                    setItemForm((s) => ({
                      ...s,
                      categoryId: e.target.value || undefined,
                    }))
                  }
                  placeholder="categoryId"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-brand">شناسه برند (اختیاری)</Label>
                <Input
                  id="i-brand"
                  value={(itemForm as CreateInventoryCountItemDto).brandId ?? ""}
                  onChange={(e) =>
                    setItemForm((s) => ({
                      ...s,
                      brandId: e.target.value || undefined,
                    }))
                  }
                  placeholder="brandId"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-vm">شناسه مدل خودرو (اختیاری)</Label>
                <Input
                  id="i-vm"
                  value={(itemForm as CreateInventoryCountItemDto).vehicleModelId ?? ""}
                  onChange={(e) =>
                    setItemForm((s) => ({
                      ...s,
                      vehicleModelId: e.target.value || undefined,
                    }))
                  }
                  placeholder="vehicleModelId"
                />
              </div>
            </div>

            {itemError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{itemError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAddItem}
                disabled={addItemMut.isPending}
              >
                <Plus className="h-4 w-4" />
                {addItemMut.isPending ? "در حال افزودن..." : "افزودن آیتم"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* دیالوگ پایان شمارش */}
      <ConfirmDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title="پایان شمارش"
        description="با پایان دادن، این جلسه به‌عنوان تکمیل‌شده علامت‌گذاری می‌شود. مطمئن هستید؟"
        confirmText="بله، پایان بده"
        cancelText="انصراف"
        loading={finishMut.isPending}
        onConfirm={() => finishMut.mutate()}
      />

      {/* دیالوگ اعمال روی موجودی — عملیات برگشت‌ناپذیر */}
      <ConfirmDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        title="اعمال روی موجودی واقعی"
        description="این عملیات موجودی واقعی را تغییر می‌دهد و برگشت‌ناپذیر است. مطمئن هستید؟"
        confirmText="بله، اعمال کن"
        cancelText="انصراف"
        destructive
        loading={applyMut.isPending}
        onConfirm={() => applyMut.mutate()}
      />
    </div>
  );
}

// ----- نمایش اطلاعات سشن + جدول آیتم‌ها -----
function CountView({
  countQ,
}: {
  countQ: UseQueryResult<InventoryCount>;
}) {
  const data = countQ.data;
  if (!data) return null;

  const items = data.items ?? [];

  const statusBadge = (() => {
    const s = data.status ?? "ACTIVE";
    if (s === "FINISHED")
      return (
        <Badge className="bg-amber-100 text-amber-700">پایان‌یافته</Badge>
      );
    if (s === "APPLIED")
      return (
        <Badge className="bg-emerald-100 text-emerald-700">اعمال‌شده</Badge>
      );
    return (
      <Badge variant="secondary" className="bg-sky-100 text-sky-700">
        در حال انجام
      </Badge>
    );
  })();

  return (
    <>
      {/* اطلاعات سشن */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">اطلاعات جلسه</CardTitle>
          <CardDescription>
            جزئیات جلسه‌ی انبارگردانی و وضعیت فعلی.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Info label="شناسه سشن" value={data.sessionId} />
            <Info
              label="موقعیت"
              value={data.location?.name ?? data.locationId}
            />
            <Info label="وضعیت" value={undefined} extra={statusBadge} />
            <Info label="تعداد آیتم‌ها" value={formatNumber(items.length)} />
            <Info
              label="تاریخ شروع"
              value={formatDateTime(data.createdAt)}
            />
            <Info
              label="تاریخ پایان"
              value={formatDateTime(data.finishedAt)}
            />
          </div>
        </CardContent>
      </Card>

      {/* جدول آیتم‌ها */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">آیتم‌های شمارش‌شده</CardTitle>
          <CardDescription>
            فهرست اقلامی که در این جلسه شمرده شده‌اند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              title="هنوز آیتمی اضافه نشده"
              description="از فرم پایین، اولین قلم را به این شمارش اضافه کنید."
              icon={ClipboardList}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="min-w-[180px]">نام قلم</TableHead>
                    <TableHead>محصول</TableHead>
                    <TableHead className="text-end">سالم</TableHead>
                    <TableHead className="text-end">خراب</TableHead>
                    <TableHead className="text-end">مجموع</TableHead>
                    <TableHead className="min-w-[180px]">یادداشت</TableHead>
                    <TableHead className="min-w-[200px]">متن گفتار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.name}
                        {it.productId ? (
                          <span className="block text-xs text-muted-foreground">
                            {it.product?.name ?? it.productId}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {it.product?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          {formatNumber(it.goodQuantity ?? 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge
                          variant="outline"
                          className="border-rose-200 bg-rose-50 text-rose-700"
                        >
                          {formatNumber(it.badQuantity ?? 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end font-semibold">
                        {formatNumber(
                          (it.goodQuantity ?? 0) + (it.badQuantity ?? 0)
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {it.note ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {it.voiceText ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Info({
  label,
  value,
  extra,
}: {
  label: string;
  value?: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {extra ? (
        <div>{extra}</div>
      ) : (
        <span className="font-medium">{value && value !== "" ? value : "—"}</span>
      )}
    </div>
  );
}
