import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

import { INT4_MAX } from '../../common/money';

/**
 * یک سطر از **تقسیمِ نهاییِ** پرداخت‌های فاکتور.
 *
 * مبلغِ نهایی است، نه اختلاف: پنل کلِ تقسیم را می‌فرستد (نقد ۳۰م، کارت ۰،
 * نسیه ۷۰م) و سرور خودش تفاضل را با وضعِ فعلی حساب می‌کند. اگر کلاینت اختلاف
 * می‌فرستاد، هر خطای گرد‌کردن به یک عددِ غلط روی سند تبدیل می‌شد.
 */
export class RecomposePaymentRowDto {
  /**
   * نقد / کارتخوان / نسیه.
   *
   * **چک پذیرفته نمی‌شود** — چکِ ثبت‌شده در فهرستِ چک‌ها زندگی می‌کند و
   * برگرداندنش باید از مسیر خودش (وصول/برگشت) برود. سرور اگر چک ببیند رد
   * می‌کند.
   */
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RecomposePaymentsDto {
  /** کلید یکتای کلاینت — ارسالِ دوبارهٔ همان عملیات ردیفِ تکراری نمی‌سازد. */
  @IsString()
  idempotencyKey: string;

  /** دلیلِ اصلاح. اختیاری — ولی روی دفتر و سند می‌نشیند. */
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /**
   * مشتریِ فاکتور — فقط برای فاکتورِ **بدونِ مشتری**.
   *
   * فاکتورِ نقدیِ گذری که واقعیتش نسیه بوده: همان‌جا مشتری انتخاب (یا ساخته)
   * می‌شود، فاکتور به او وصل می‌شود و مبلغِ باقی‌مانده به بدهی‌اش می‌نشیند.
   * فاکتوری که از قبل مشتری دارد عوض نمی‌شود.
   */
  @IsOptional()
  @IsString()
  customerId?: string;

  /** تقسیمِ نهاییِ پرداخت — جمعِ بخشِ غیرنسیه نباید از مبلغِ فاکتور بگذرد. */
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RecomposePaymentRowDto)
  payments: RecomposePaymentRowDto[];
}
