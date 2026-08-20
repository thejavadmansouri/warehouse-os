"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { JalaliDateInput } from "@/components/jalali-date-input";
import { MoneyInput } from "@/components/money-input";
import {
  bpToPercent,
  computeChequeCharge,
  percentToBp,
  suggestMonths,
} from "@/lib/cheque-charge";
import { faToEn, money, toFa } from "@/lib/format";
import { getShopSettings } from "@/lib/api";
import type { ChequeInput } from "@/lib/types";

/**
 * مشخصات یک چک، به‌علاوه‌ی تفاوتِ فروشِ مدت‌دار.
 *
 * قبلاً همین فیلدها در «پرداخت ترکیبی» صندوق و فرم «دریافت» جدا نوشته شده بودند.
 * حالا که ماشین‌حسابِ سود هم اضافه شده، دو نسخه یعنی دو عددِ متفاوت روی دو صفحه.
 *
 * **قرارداد مبلغ‌ها** (همان چیزی که سرور هم می‌فهمد):
 *
 *     base   = مبلغِ سطرِ پرداخت — چقدر از صورتحساب/بدهی را می‌پوشاند
 *     charge = تفاوتِ فروشِ مدت‌دار
 *     مبلغِ روی کاغذِ چک = base + charge
 *
 * مبلغِ چک دست‌کاری نمی‌شود تا «مبلغ» بماند؛ خودِ همان عددی است که بانک پاس
 * می‌کند. تفکیکش ذخیره می‌شود تا گزارشِ سود، حاشیه‌ی کالا را با درآمدِ مدت قاطی
 * نکند.
 */
export function ChequeFields({
  base,
  value,
  defaultRateBp = 0,
  defaultRateMode = "MONTHLY",
  onChange,
}: {
  /** مبلغِ سطرِ پرداخت — پایه‌ی محاسبه‌ی سود. */
  base: number;
  value: ChequeInput | undefined;
  /** نرخِ خودِ مشتری. صفر یعنی «از فروشگاه بگیر». */
  defaultRateBp?: number;
  defaultRateMode?: "FLAT" | "MONTHLY";
  onChange: (cheque: ChequeInput) => void;
}) {
  /*
   * پیش‌فرضِ فروشگاه اینجا خوانده می‌شود، نه در والدها.
   *
   * دو فرم از این کامپوننت استفاده می‌کنند و اگر هرکدام خودش fallback را حل
   * می‌کرد، یکی یادش می‌رفت. کش مشترک است (همان کلیدی که سربرگ فاکتور می‌خواند)،
   * پس هزینه‌ی اضافه‌ای ندارد.
   */
  const shop = useQuery({
    queryKey: ["shop-settings"],
    queryFn: getShopSettings,
    staleTime: 5 * 60_000,
  });

  const fallbackBp = defaultRateBp || shop.data?.chequeRateBp || 0;
  const fallbackMode =
    defaultRateBp > 0 ? defaultRateMode : shop.data?.chequeRateMode ?? defaultRateMode;

  const c: ChequeInput = value ?? { number: "", dueDate: "" };
  const rateMode = c.rateMode ?? fallbackMode;
  const rateBp = c.rateBp ?? 0;

  /** ورودیِ درصد جدا نگه داشته می‌شود تا تایپِ «۲.» وسطِ کار پاک نشود. */
  const [ratePercent, setRatePercent] = React.useState<string>(() =>
    rateBp ? bpToPercent(rateBp) : "",
  );
  /** مبلغِ سودِ دستی — خالی یعنی «از نرخ حساب کن». */
  const [manual, setManual] = React.useState<number | null>(
    c.charge != null ? c.charge : null,
  );

  const patch = (p: Partial<ChequeInput>) => onChange({ ...c, ...p });

  const computed = computeChequeCharge({
    base,
    rateBp,
    months: c.months ?? 0,
    mode: rateMode,
  });
  const charge = manual ?? computed;
  const face = base + charge;

  /*
   * وقتی سررسید عوض می‌شود، تعدادِ ماه پیشنهاد داده می‌شود — ولی فقط پیشنهاد.
   * فروشنده می‌گوید «سه‌ماهه»، پس عدد قابلِ ویرایش می‌ماند و هرچه انتخاب شد
   * همان ذخیره می‌شود.
   */
  const onDueDate = (iso: string) => {
    const months = iso ? suggestMonths(iso) : 0;
    patch({
      dueDate: iso,
      // نرخِ پیشنهادی تنها وقتی می‌نشیند که فروشنده هنوز چیزی نگذاشته باشد.
      ...(c.rateBp == null && fallbackBp > 0
        ? { rateBp: fallbackBp, rateMode: fallbackMode }
        : {}),
      ...(c.months == null ? { months } : {}),
    });
    if (c.rateBp == null && fallbackBp > 0 && !ratePercent) {
      setRatePercent(bpToPercent(fallbackBp));
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="شماره چک"
          value={c.number}
          onChange={(e) => patch({ number: e.target.value })}
        />
        <Input
          placeholder="بانک"
          value={c.bankName ?? ""}
          onChange={(e) => patch({ bankName: e.target.value })}
        />
        {/* سررسید شمسی وارد می‌شود — فروشنده تاریخ میلادی را از کسی نمی‌شنود و
            روی خودِ چک هم شمسی نوشته شده. */}
        <JalaliDateInput
          value={c.dueDate?.slice(0, 10) ?? ""}
          onChange={onDueDate}
        />
      </div>

      {/* ---- تفاوتِ فروشِ مدت‌دار ---- */}
      <div className="rounded-md border bg-muted/20 p-2">
        <div className="grid grid-cols-4 items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">نرخ ٪</span>
            <Input
              dir="ltr"
              inputMode="decimal"
              className="h-9 text-right tabular-nums"
              value={ratePercent}
              placeholder="۰"
              onChange={(e) => {
                setRatePercent(e.target.value);
                setManual(null); // نرخ عوض شد → عددِ دستی کنار می‌رود
                patch({
                  rateBp: percentToBp(faToEn(e.target.value)),
                  rateMode,
                  charge: undefined,
                });
              }}
            />
          </label>

          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">ماه</span>
            <Input
              dir="ltr"
              inputMode="numeric"
              disabled={rateMode === "FLAT"}
              className="h-9 text-right tabular-nums"
              value={c.months ? toFa(c.months) : ""}
              placeholder="۰"
              onChange={(e) => {
                setManual(null);
                patch({
                  months: Number(faToEn(e.target.value).replace(/\D/g, "")) || 0,
                  charge: undefined,
                });
              }}
            />
          </label>

          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">سود</span>
            <MoneyInput
              className="h-9 text-right tabular-nums"
              value={charge}
              onChange={(n) => {
                // عددِ دستیِ فروشنده می‌چربد — «۶۰۰ هزار گرد کردم».
                setManual(n);
                patch({ charge: n });
              }}
            />
          </label>

          <div className="text-xs">
            <span className="mb-1 block text-muted-foreground">مبلغ چک</span>
            <div className="flex h-9 items-center justify-end rounded-md border bg-background px-2 font-bold tabular-nums">
              {money(face)}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(
              [
                ["MONTHLY", "در ماه"],
                ["FLAT", "ثابت"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setManual(null);
                  patch({ rateMode: mode, charge: undefined });
                }}
                className={`h-6 rounded border px-2 text-[11px] font-medium transition-colors ${
                  rateMode === mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:border-primary hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-muted-foreground">
            {charge > 0
              ? `${money(base)} بابت حساب + ${money(charge)} تفاوت مدت`
              : "بدون تفاوت مدت — مبلغ چک همان مبلغ حساب است"}
          </span>
        </div>
      </div>
    </div>
  );
}
