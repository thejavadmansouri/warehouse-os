"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  JALALI_MAX_YEAR,
  faToEn,
  isValidJalali,
  toGregorian,
  toJalali,
} from "@/lib/jalali";
import { cn } from "@/lib/utils";

/** پاک‌سازی ورودی کاربر: ارقام فارسی/عربی → انگلیسی و حذف هر کاراکتر غیرعددی. */
function sanitizeDigits(input: string, maxLen: number): string {
  return faToEn(input).replace(/\D/g, "").slice(0, maxLen);
}

/** آیا مقدارِ یک فیلد به‌تنهایی از محدوده خارج است؟ (برای حاشیه‌ی قرمزِ زودهنگام) */
function fieldOutOfRange(value: string, max: number): boolean {
  if (value === "") return false;
  const n = Number(value);
  return n > max || (n === 0 && value.length >= 2);
}

/** بعد از پر شدنِ یک فیلد، به فیلدِ بعدی برو. */
function shouldAdvance(value: string, field: "day" | "month"): boolean {
  if (value.length >= 2) return true;
  const n = Number(value);
  if (field === "day") return n >= 4; // روزِ ۴ تا ۹ فقط یک‌رقمی است
  return n >= 2; // ماهِ ۲ تا ۹ فقط یک‌رقمی است
}

/** حالت سه فیلد (همیشه ارقام انگلیسی). */
interface FieldState {
  day: string;
  month: string;
  year: string;
}

const EMPTY_FIELDS: FieldState = { day: "", month: "", year: "" };

/** آیا دو مقدارِ عددی معادل‌اند؟ («05» و «5» یکی‌اند؛ رشته‌ی خالی فقط با خالی برابر است) */
function partsEqual(a: string, b: string): boolean {
  if (a === "" || b === "") return a === b;
  return Number(a) === Number(b);
}

/** رشته‌ی ISO (مثل «2026-08-09») → Date در timezone محلی؛ اگر نامعتبر بود null. */
function isoToLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) {
    const gy = Number(m[1]);
    const gm = Number(m[2]);
    const gd = Number(m[3]);
    const d = new Date(gy, gm - 1, gd);
    if (
      d.getFullYear() === gy &&
      d.getMonth() === gm - 1 &&
      d.getDate() === gd
    ) {
      return d;
    }
    return null;
  }
  // شکل‌های دیگر (مثلاً datetime کامل) را هم می‌پذیریم.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → رشته‌ی ISO «YYYY-MM-DD» بر اساس اجزای محلی. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** استخراج سه فیلد از رشته‌ی ISO؛ اگر خالی/نامعتبر بود فیلدهای خالی برمی‌گرداند. */
function fieldsFromValue(value: string | undefined): FieldState {
  if (!value) return EMPTY_FIELDS;
  const d = isoToLocalDate(value);
  if (!d) return EMPTY_FIELDS;
  const { jy, jm, jd } = toJalali(d);
  return { day: String(jd), month: String(jm), year: String(jy) };
}

interface JalaliDateInputProps {
  /** تاریخ به‌صورت ISO میلادی، مثل «2026-08-09». */
  value?: string;
  /** فقط وقتی هر سه فیلد معتبر باشند با ISO میلادی صدا زده می‌شود. */
  onChange: (iso: string) => void;
  disabled?: boolean;
  /** روی فیلد «روز» می‌نشیند؛ فیلدهای دیگر «<id>-month» و «<id>-year» می‌گیرند. */
  id?: string;
}

/**
 * ورودی تاریخ شمسی با سه فیلد عددی — کامپکت، در یک سطر.
 *
 * طرح: «۱۴۰۵/۰۶/۲۸» داخلِ یک کادر با جداکننده‌های نازک؛ عنوانِ روز/ماه/سال
 * به‌جای لیبلِ بالای هر فیلد، placeholder داخلِ خودِ فیلدهاست (هُوَر با
 * کیبورد و inputMode کار می‌کند). تاریخِ کاملِ معتبر با خطِ زیرینِ کوچک
 * خودش را معرفی می‌کند؛ خطا فقط قرمزِ فیلدهاست، نه یک پاراگرافِ اضافه.
 *
 * ارقام فارسی و انگلیسی هر دو پذیرفته می‌شوند؛ با پر شدنِ هر فیلد فوکوس
 * خودکار به فیلد بعدی می‌رود؛ فقط تاریخِ کامل و معتبر به onChange می‌رسد.
 */
export function JalaliDateInput({
  value,
  onChange,
  disabled = false,
  id,
}: JalaliDateInputProps) {
  const [fields, setFields] = React.useState<FieldState>(() =>
    fieldsFromValue(value),
  );
  // آخرین value ای که با state ی فیلدها همگام شده — برای «تنظیم state هنگام رندر».
  const [syncedValue, setSyncedValue] = React.useState(value);

  const dayRef = React.useRef<HTMLInputElement>(null);
  const monthRef = React.useRef<HTMLInputElement>(null);
  const yearRef = React.useRef<HTMLInputElement>(null);
  const lastEmitted = React.useRef<string | null>(null);

  // همگام‌سازی state با prop ی value به‌روشِ رسمیِ React («adjust state during
  // render»): فقط وقتی خودِ prop عوض شود اجرا می‌شود و هنگام تایپِ کاربر که
  // value ثابت می‌ماند هیچ کاری نمی‌کند. اگر فیلدها همین حالا همان تاریخ را
  // نشان می‌دهند، state جابه‌جا نمی‌شود تا مکانِ نشانگر (cursor) نپرد.
  if (syncedValue !== value) {
    setSyncedValue(value);
    setFields((prev) => {
      const next = fieldsFromValue(value);
      return partsEqual(prev.day, next.day) &&
        partsEqual(prev.month, next.month) &&
        partsEqual(prev.year, next.year)
        ? prev
        : next;
    });
  }

  const dayNum = fields.day === "" ? 0 : Number(fields.day);
  const monthNum = fields.month === "" ? 0 : Number(fields.month);
  const yearNum = fields.year === "" ? 0 : Number(fields.year);

  const complete =
    fields.day !== "" && fields.month !== "" && fields.year !== "";
  const valid = complete && isValidJalali(yearNum, monthNum, dayNum);

  // «تاریخ کامل ولی نامعتبر» → همه‌ی فیلدها قرمز؛ وگرنه فقط فیلدی که خودش
  // بیرونِ محدوده است (مثل روزِ ۴۵ یا ماهِ ۱۳).
  const invalid = complete && !valid;
  const dayInvalid = invalid || fieldOutOfRange(fields.day, 31);
  const monthInvalid = invalid || fieldOutOfRange(fields.month, 12);
  const yearInvalid = invalid || fieldOutOfRange(fields.year, JALALI_MAX_YEAR);

  // فقط تاریخِ کامل و معتبر → onChange با ISO میلادی.
  React.useEffect(() => {
    if (!valid) {
      lastEmitted.current = null;
      return;
    }
    const iso = toIsoDate(toGregorian(yearNum, monthNum, dayNum));
    if (iso === value) {
      lastEmitted.current = iso;
      return;
    }
    if (lastEmitted.current !== iso) {
      lastEmitted.current = iso;
      onChange(iso);
    }
  }, [dayNum, monthNum, yearNum, valid, value, onChange]);

  /** تغییر یک فیلد: پاک‌سازی ارقام + فوکوس خودکار به فیلد بعدی. */
  const handleFieldChange =
    (field: "day" | "month" | "year") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const maxLen = field === "year" ? 4 : 2;
      const next = sanitizeDigits(e.target.value, maxLen);
      // اصلاحِ مستقیمِ DOM تا کاراکترهای غیرعددی حتی بدون re-render هم حذف شوند.
      if (next !== e.target.value) {
        e.target.value = next;
      }
      setFields((prev) => ({ ...prev, [field]: next }));
      if (field !== "year" && shouldAdvance(next, field)) {
        (field === "day" ? monthRef : yearRef).current?.focus();
      }
    };

  const dayInputId = id;
  const monthInputId = id ? `${id}-month` : undefined;
  const yearInputId = id ? `${id}-year` : undefined;

  return (
    /*
      یک کادرِ واحد با سه خانه: روز/ماه/سال با جداکننده‌ی «/».
      عنوانِ هر خانه داخلِ placeholder است تا سطرِ لیبلِ اضافه نداشته باشیم.
    */
    <div dir="rtl" className="flex w-fit items-center">
      <div
        className={cn(
          "flex h-8 items-center overflow-hidden rounded-md border bg-background text-sm",
          invalid && "border-destructive",
        )}
      >
        <Input
          id={dayInputId}
          ref={dayRef}
          inputMode="numeric"
          autoComplete="off"
          placeholder="روز"
          title="روز"
          value={fields.day}
          onChange={handleFieldChange("day")}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          aria-invalid={dayInvalid || undefined}
          aria-label="روز"
          className="h-8 w-10 rounded-none border-0 bg-transparent px-1 text-center tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <span aria-hidden className="h-8 w-px bg-border" />
        <Input
          id={monthInputId}
          ref={monthRef}
          inputMode="numeric"
          autoComplete="off"
          placeholder="ماه"
          title="ماه"
          value={fields.month}
          onChange={handleFieldChange("month")}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          aria-invalid={monthInvalid || undefined}
          aria-label="ماه"
          className="h-8 w-10 rounded-none border-0 bg-transparent px-1 text-center tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <span aria-hidden className="h-8 w-px bg-border" />
        <Input
          id={yearInputId}
          ref={yearRef}
          inputMode="numeric"
          autoComplete="off"
          placeholder="سال"
          title="سال"
          value={fields.year}
          onChange={handleFieldChange("year")}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          aria-invalid={yearInvalid || undefined}
          aria-label="سال"
          className="h-8 w-14 rounded-none border-0 bg-transparent px-1 text-center tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}
