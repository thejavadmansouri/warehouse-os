import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsArray,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

import { INT4_MAX } from '../../common/money';
import { ChequeDto } from './create-invoice.dto';

/**
 * یک قلمِ برگشتی در عملیاتِ یکپارچه.
 *
 * مثل مرجوعیِ مستقل به ردیفِ SALEِ همان فاکتور قفل است؛ کالا و قیمت از فاکتور
 * می‌آیند. سقفِ هر ردیف «مانده‌ی قابل‌برگشت» است (فروش + اثر اصلاحیه‌ها −
 * مرجوعی‌های قبلی).
 */
export class AdjustReturnLineDto {
  /** شناسه‌ی ردیفِ SALE (InventoryLog) در فاکتور. */
  @IsString()
  saleLogId: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  /** سالم = به موجودی برمی‌گردد (پیش‌فرض)؛ معیوب = فقط اثر مالی، بدون حرکت انبار. */
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

/**
 * یک قلمِ تصحیح‌شده — تغییرِ تعداد و/یا قیمتِ یک ردیفِ موجود.
 *
 * «از چه» (تعداد و قیمت فعلی) از سرور می‌آید؛ `newQuantity` هدفِ جدید است
 * (صفر = کلِ مانده برمی‌گردد) و `newUnitPrice` قیمتِ واحدِ جدید.
 */
export class AdjustChangeLineDto {
  @IsString()
  saleLogId: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  newQuantity: number;

  /** سقف = بردِ ستون Int (۲.۱ میلیارد ریال) — هم‌سقف با بقیهٔ سندها، نه یک عددِ دلخواهِ پایین‌تر. */
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  newUnitPrice: number;
}

/** قلمِ تازه‌ای که با همین عملیات به فاکتور اضافه می‌شود. */
export class AdjustAddLineDto {
  @IsString()
  productId: string;

  /** خالی = مکانِ سیستمی «موجودی ثبت‌نشده»، مثل خودِ فروش. */
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  unitPrice: number;
}

/**
 * تسویه‌ی اختلافِ نهاییِ عملیات.
 *
 * `amount` اختیاری است — مبلغِ اختلاف را سرور حساب می‌کند. اگر کلاینت فرستاد
 * باید دقیقاً با مبلغِ محاسبه‌شده برابر باشد وگرنه درخواست رد می‌شود (تا عددی
 * که فروشنده در UI می‌بیند همانی باشد که ثبت می‌شود).
 */
export class AdjustSettlementDto {
  /**
   * - CREDIT: اختلاف روی حسابِ مشتری می‌نشیند (نیازمند مشتری).
   * - CASH/CARD: همان لحظه ردوبدل می‌شود (دریافت برای اختلاف مثبت، پرداخت برای منفی).
   * - CHEQUE: فقط برای **دریافت** (اختلاف مثبت) — به‌عنوان رسیدِ چکی ثبت می‌شود.
   */
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  amount?: number;

  /** فقط وقتی method برابر CHEQUE است لازم می‌شود. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ChequeDto)
  cheque?: ChequeDto;
}

export class CreateAdjustDto {
  /** کلید یکتای کلاینت — retry شبکه و دو درخواست هم‌زمان تکراری نمی‌سازند. */
  @IsString()
  idempotencyKey: string;

  /** دلیلِ عملیات — اجباری، روی هر دو سندِ حاصل می‌نشیند. */
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** اقلامِ برگشتی — سقفِ هر ردیف مانده‌ی قابل‌برگشت است. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustReturnLineDto)
  returns?: AdjustReturnLineDto[];

  /** تصحیحِ تعداد/قیمتِ ردیف‌های موجود. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustChangeLineDto)
  changes?: AdjustChangeLineDto[];

  /** قلم‌های تازه‌ای که به همین فاکتور اضافه می‌شوند. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustAddLineDto)
  additions?: AdjustAddLineDto[];

  /** تسویه‌ی اختلافِ نهایی. برای اختلاف صفر لازم نیست. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AdjustSettlementDto)
  settlement?: AdjustSettlementDto;

  /**
   * تعدیلِ دستیِ مدیر روی اختلافِ نهایی (ریال) — مثبت یعنی بیشتر گرفته شود،
   * منفی کمتر. چانه‌زنی و گرد‌کردنِ مبلغ سرِ پیشخوان؛ روی همان اصلاحیه به‌عنوان
   * بخشی از amountAdjust ثبت می‌شود، پس فاکتور و دفتر هیچ‌وقت با عددِ صفحه
   * نمی‌خوانند.
   */
  @IsOptional()
  @IsInt()
  @Min(-INT4_MAX)
  @Max(INT4_MAX)
  manualAdjustment?: number;
}
