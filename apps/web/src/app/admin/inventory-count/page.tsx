"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  AlertCircle,
  Plus,
  Mic,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

import {
  createInventoryCount,
  getInventoryCount,
  getLocations,
  startVoiceSession,
} from "@/lib/api";
import type { CreateInventoryCountDto } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import {
  LoadingState,
  ErrorState,
} from "@/components/states";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ALLOWED: Array<"ADMIN" | "MANAGER" | "STAFF"> = [
  "ADMIN",
  "MANAGER",
  "STAFF",
];

export default function InventoryCountListPage() {
  const router = useRouter();
  const hasRole = useAuthStore((s) => s.hasRole);
  const canCreate = hasRole(...ALLOWED);
  const { toast } = useToast();

  const [sessionId, setSessionId] = React.useState<string>("");
  const [locationId, setLocationId] = React.useState<string>("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [manualId, setManualId] = React.useState<string>("");

  // بارگذاری موقعیت‌ها — طبق بخش ۶.۶ — GET /locations
  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => getLocations(),
  });

  // ساخت سشن صوتی — طبق بخش ۶.۸ — POST /inventory-session/start
  const startSessionMut = useMutation({
    mutationFn: () => startVoiceSession({}),
    onSuccess: (res) => {
      setSessionId(res.id);
      toast({
        title: "سشن صوتی شروع شد",
        description: "شناسه سشن با موفقیت ساخته شد.",
      });
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException
          ? e.message
          : "شروع سشن ناموفق بود. می‌توانید شناسه را دستی وارد کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // طبق بخش ۶.۹ — POST /inventory-count
  const createMut = useMutation({
    mutationFn: (dto: CreateInventoryCountDto) =>
      createInventoryCount(dto),
    onSuccess: (res) => {
      toast({
        title: "انبارگردانی شروع شد",
        description: "در حال انتقال به صفحه‌ی جزئیات...",
      });
      router.push(`/admin/inventory-count/${res.id}`);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException
          ? e.message
          : "ایجاد انبارگردانی ناموفق بود. دوباره تلاش کنید.";
      toast({
        title: "خطا",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleStart = () => {
    if (!sessionId.trim()) {
      setFormError("ابتدا یک شناسه سشن وارد کنید یا سشن صوتی را شروع کنید.");
      return;
    }
    if (!locationId) {
      setFormError("موقعیت انبارگردانی را انتخاب کنید.");
      return;
    }
    setFormError(null);
    const dto: CreateInventoryCountDto = {
      sessionId: sessionId.trim(),
      locationId,
    };
    createMut.mutate(dto);
  };

  if (!canCreate) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="انبارگردانی"
          description="شروع و مدیریت فرآیند شمارش انبار"
          icon={ClipboardList}
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>دسترسی غیرمجاز</AlertTitle>
          <AlertDescription>
            ایجاد انبارگردانی فقط برای مدیر کل، مدیر و کاربر مجاز است.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="انبارگردانی"
        description="شروع یک جلسه شمارش برای یک موقعیت مشخص"
        icon={ClipboardList}
      />

      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>راهنما</AlertTitle>
        <AlertDescription>
          برای شروع انبارگردانی ابتدا یک «سشن صوتی» بسازید (یا شناسه‌ی سشن
          موجود را دستی وارد کنید)، سپس موقعیت انبار را انتخاب کرده و دکمه‌ی
          «شروع» را بزنید. پس از ایجاد، به صفحه‌ی جزئیات منتقل می‌شوید.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-accent" />
              شروع انبارگردانی جدید
            </CardTitle>
            <CardDescription>
              یک سشن شمارش جدید برای یک موقعیت ایجاد کنید.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-session">شناسه سشن</Label>
              <div className="flex gap-2">
                <Input
                  id="c-session"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="مثلاً: sess_abc123 یا UUID"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startSessionMut.mutate()}
                  disabled={startSessionMut.isPending}
                >
                  <Mic className="h-4 w-4" />
                  {startSessionMut.isPending
                    ? "در حال ساخت..."
                    : "شروع سشن"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                می‌توانید شناسه‌ی سشن صوتی از پیش ساخته‌شده را دستی وارد
                کنید یا با دکمه «شروع سشن» یک سشن جدید بسازید.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-location">موقعیت انبارگردانی</Label>
              <Select
                value={locationId}
                onValueChange={(v) => setLocationId(v)}
                disabled={locationsQ.isLoading}
              >
                <SelectTrigger id="c-location" className="w-full">
                  <SelectValue
                    placeholder={
                      locationsQ.isLoading
                        ? "در حال بارگذاری..."
                        : "انتخاب موقعیت"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locationsQ.isLoading ? (
                    <SelectItem value="__loading" disabled>
                      در حال بارگذاری...
                    </SelectItem>
                  ) : locationsQ.isError ? (
                    <SelectItem value="__error" disabled>
                      خطا در بارگذاری موقعیت‌ها
                    </SelectItem>
                  ) : (locationsQ.data ?? []).length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      موقعیتی ثبت نشده
                    </SelectItem>
                  ) : (
                    (locationsQ.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        {l.code ? ` — ${l.code}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {formError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleStart}
                disabled={createMut.isPending}
              >
                <Plus className="h-4 w-4" />
                {createMut.isPending ? "در حال ایجاد..." : "شروع انبارگردانی"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* دسترسی سریع به یک شمارش با id */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              دسترسی به یک شمارش موجود
            </CardTitle>
            <CardDescription>
              اگر شناسه‌ی یک انبارگردانی از پیش ساخته‌شده را دارید، اینجا وارد
              کنید.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-id">شناسه انبارگردانی</Label>
              <Input
                id="m-id"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="مثلاً: count_abc123"
              />
            </div>
            <Link
              href={
                manualId.trim()
                  ? `/admin/inventory-count/${encodeURIComponent(manualId.trim())}`
                  : "#"
              }
              className="inline-block"
            >
              <Button
                type="button"
                variant="secondary"
                disabled={!manualId.trim()}
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4" />
                رفتن به جزئیات
              </Button>
            </Link>
            <QuickVerifyButton id={manualId.trim()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// دکمه‌ی بررسی وجود یک شمارش (GET /inventory-count/:id) — طبق بخش ۶.۹
function QuickVerifyButton({ id }: { id: string }) {
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ["inventory-count", "verify", id],
    queryFn: () => getInventoryCount(id),
    enabled: false,
  });

  const handleVerify = () => {
    if (!id) return;
    q.refetch().then((res) => {
      const data = res.data;
      if (data) {
        toast({
          title: "انبارگردانی پیدا شد",
          description: `موقعیت: ${data.location?.name ?? data.locationId ?? "—"}${
            data.status ? ` — وضعیت: ${data.status}` : ""
          }`,
        });
      }
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!id || q.isFetching}
      onClick={handleVerify}
    >
      {q.isFetching ? (
        <LoadingState className="py-0" label="" />
      ) : (
        "بررسی وجود"
      )}
    </Button>
  );
}
