"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { getShopSettings, updateShopSettings } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import type { CurrencyUnit, ShopSettings } from "@/lib/types";
import { bpToPercent, percentToBp } from "@/lib/cheque-charge";
import { faToEn } from "@/lib/format";

const EMPTY: ShopSettings = {
  name: "",
  phone: "",
  address: "",
  cardNumber: "",
  cardHolder: "",
  footer: "",
  chequeRateBp: 0,
  chequeRateMode: "MONTHLY",
  storedUnit: "RIAL",
  panelUnit: "RIAL",
  siteUnit: "TOMAN",
};

const UNITS = [
  ["RIAL", "ریال"],
  ["TOMAN", "تومان"],
] as const;

/**
 * مشخصات مغازه.
 *
 * هرچه اینجا نوشته شود روی سربرگ فاکتور، پیش‌فاکتور و صورت‌حساب چاپ می‌شود.
 * جدا از «انبار» است: انبار یک مفهوم داخلی است، این چیزی است که مشتری می‌بیند.
 */
/** داخلِ صفحه‌ی میزبان سرتیترِ خودش را نشان نمی‌دهد. */
export function ShopSettingsPanel({ embedded }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["shop-settings"], queryFn: getShopSettings });
  const [form, setForm] = React.useState<ShopSettings | null>(null);

  const value = form ?? settings.data ?? EMPTY;
  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) =>
    setForm({ ...value, [k]: v });

  const save = useMutation({
    /*
     * فقط فیلدهای قابل ویرایش فرستاده می‌شوند.
     *
     * پاسخِ GET کل ردیف دیتابیس است و `id` و `updatedAt` هم دارد. سرور
     * `forbidNonWhitelisted` است، پس فرستادنِ آن‌ها یعنی ۴۰۰ — و دقیقاً به
     * همین دلیل دکمه‌ی ذخیره ظاهراً هیچ کاری نمی‌کرد.
     */
    mutationFn: () =>
      updateShopSettings({
        name: value.name,
        phone: value.phone,
        address: value.address,
        cardNumber: value.cardNumber,
        cardHolder: value.cardHolder,
        footer: value.footer,
        chequeRateBp: value.chequeRateBp,
        chequeRateMode: value.chequeRateMode,
        storedUnit: value.storedUnit,
        panelUnit: value.panelUnit,
        siteUnit: value.siteUnit,
      }),
    onSuccess: () => {
      toast.success("مشخصات مغازه ذخیره شد");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["shop-settings"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "ذخیره ناموفق بود"),
  });

  if (settings.isLoading) return <LoadingState />;
  if (settings.isError) return <ErrorState onRetry={() => settings.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        compact={embedded}
        title="مشخصات مغازه"
        description="روی سربرگ فاکتور، پیش‌فاکتور و صورت‌حساب چاپ می‌شود"
        icon={Store}
      />

      <Card className="max-w-2xl space-y-4 p-5">
        <Field label="نام مغازه">
          <Input
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="مثلاً: لوازم یدکی احمدی"
          />
        </Field>

        <Field label="تلفن">
          <Input
            dir="ltr"
            className="text-right"
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="۰۲۱…"
          />
        </Field>

        <Field label="آدرس">
          <Input
            value={value.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>

        {/*
          پیش‌فرضِ فروشِ مدت‌دار.

          این فقط پیشنهادِ صندوق است: هر مشتری می‌تواند نرخِ خودش را داشته باشد و
          فروشنده سرِ هر چک هم می‌تواند عوضش کند. صفر یعنی «هیچ سودی پیشنهاد نده».
        */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="mb-1 text-sm font-medium">تفاوت فروش مدت‌دار (چک)</p>
          <p className="mb-3 text-xs text-muted-foreground">
            پیش‌فرضِ فروشگاه. اگر برای مشتری نرخِ جداگانه‌ای ثبت شده باشد، آن
            می‌چربد. صفر یعنی سودی پیشنهاد نشود.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نرخ (درصد)">
              <Input
                dir="ltr"
                className="text-right tabular-nums"
                inputMode="decimal"
                value={bpToPercent(value.chequeRateBp)}
                onChange={(e) => set("chequeRateBp", percentToBp(faToEn(e.target.value)))}
                placeholder="۲.۵"
              />
            </Field>

            <Field label="نحوه‌ی محاسبه">
              <div className="flex gap-1">
                {(
                  [
                    ["MONTHLY", "درصد در ماه"],
                    ["FLAT", "درصد ثابت"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set("chequeRateMode", mode)}
                    className={`h-9 flex-1 rounded-md border text-sm font-medium transition-colors ${
                      value.chequeRateMode === mode
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-primary hover:text-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/*
          واحد پول.

          سه انتخاب نیست، دو انتخاب و یک واقعیت. `panelUnit` و `siteUnit` فقط
          نمایش‌اند و بی‌خطر عوض می‌شوند؛ `storedUnit` می‌گوید عددهای دیتابیس
          یعنی چه و اشتباه‌زدنش هر مبلغی را ده برابر یا یک‌دهم نشان می‌دهد.
          برای همین از آن دو جدا افتاده و هشدارش کنارش نوشته شده.
        */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="mb-1 text-sm font-medium">واحد پول</p>
          <p className="mb-3 text-xs text-muted-foreground">
            فقط روی نمایش اثر دارد. عددهای ذخیره‌شده دست‌نخورده می‌مانند و تبدیل
            موقع نشان‌دادن انجام می‌شود.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نمایش در پنل و صندوق">
              <UnitPicker
                value={value.panelUnit}
                onChange={(u) => set("panelUnit", u)}
              />
            </Field>

            <Field label="نمایش در سایت">
              <UnitPicker
                value={value.siteUnit}
                onChange={(u) => set("siteUnit", u)}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-warning">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              واحدِ خودِ داده
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              عددهای پول در دیتابیس به این واحد ذخیره شده‌اند. این یک گزارش از
              واقعیت است، نه یک ترجیح — عوض‌کردنش هیچ ردیفی را تغییر نمی‌دهد ولی
              معنیِ همه‌شان را عوض می‌کند و هر مبلغ ده برابر یا یک‌دهم دیده
              می‌شود. تا وقتی داده‌ها را واقعاً تبدیل نکرده‌ای دست نزن.
            </p>
            <UnitPicker
              value={value.storedUnit}
              onChange={(u) => set("storedUnit", u)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="شماره کارت">
            <Input
              dir="ltr"
              className="text-right tabular-nums"
              value={value.cardNumber}
              onChange={(e) => set("cardNumber", e.target.value)}
              placeholder="6037…"
            />
          </Field>
          <Field label="به نام">
            <Input
              value={value.cardHolder}
              onChange={(e) => set("cardHolder", e.target.value)}
            />
          </Field>
        </div>

        <Field label="یادداشت پایین برگه">
          <Input
            value={value.footer}
            onChange={(e) => set("footer", e.target.value)}
            placeholder="مثلاً: کالای فروخته‌شده تا ۷ روز با فاکتور پس گرفته می‌شود"
          />
        </Field>

        <Button
          className="h-11"
          disabled={!form || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </Card>
    </div>
  );
}

/**
 * انتخابگرِ واحد پول — همان الگوی دکمه‌های چسبیده‌ی «نحوه‌ی محاسبه»، چون سه بار
 * تکرار می‌شود و سه تا کپیِ دستی یعنی سه جا که می‌توانند از هم دربروند.
 */
function UnitPicker({
  value,
  onChange,
}: {
  value: CurrencyUnit;
  onChange: (u: CurrencyUnit) => void;
}) {
  return (
    <div className="flex gap-1">
      {UNITS.map(([unit, label]) => (
        <button
          key={unit}
          type="button"
          onClick={() => onChange(unit)}
          aria-pressed={value === unit}
          className={`h-9 flex-1 rounded-md border text-sm font-medium transition-colors ${
            value === unit
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:border-primary hover:text-primary"
          }`}
        >
          {label}
        </button>
      ))}
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
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function ShopSettingsPage() {
  return <ShopSettingsPanel />;
}
