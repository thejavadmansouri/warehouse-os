import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
  ArrayMaxSize,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

import { INT4_MAX } from '../../common/money';

/**
 * یک قلمِ اصلاحیه. به همان ردیفِ SALEِ فاکتور قفل می‌شود؛ تعداد و قیمتِ جدید را
 * فروشنده می‌دهد، بقیه از فاکتور می‌آیند.
 */
export class CorrectionLineDto {
  /** شناسه‌ی ردیفِ SALE (InventoryLog) در فاکتور اصلی. */
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

/**
 * قلمی که در فاکتور نبود و با همین اصلاحیه اضافه می‌شود.
 *
 * مشتری بعد از گرفتن فاکتور می‌گوید «این را هم بده» و فروشنده نباید مجبور
 * شود یک فاکتور دوم بزند. کالا از انبار کم می‌شود، به بدهی اضافه می‌شود، و
 * ردیفش از این به بعد جزو خودِ فاکتور است.
 */
export class CorrectionAddLineDto {
  @IsString()
  productId: string;

  /** قفسه‌ای که از آن برداشته می‌شود. خالی = مکانِ سیستمی، مثل خودِ فروش. */
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

export class CreateCorrectionDto {
  /** کلید یکتای کلاینت؛ ارسال دوباره اصلاحیه‌ی تکراری نمی‌سازد. */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /** فاکتوری که اصلاحیه برایش است — اجباری. فقط فاکتورِ نهایی (CONFIRMED). */
  @IsString()
  invoiceId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  note?: string;

  /**
   * ردیف‌های موجود که تصحیح می‌شوند. می‌تواند خالی باشد وقتی اصلاحیه فقط
   * قلمِ تازه اضافه می‌کند — ولی هر دو با هم خالی، یعنی سندِ بی‌محتوا.
   */
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CorrectionLineDto)
  lines: CorrectionLineDto[];

  /**
   * روشِ ردوبدلِ همان لحظه‌ی پول — فقط برای فاکتورِ **بدونِ مشتری**.
   *
   * فاکتورِ نقدیِ گذری دفتری ندارد که اختلافِ اصلاح رویش بنشیند؛ پول همان‌جا
   * سرِ پیشخوان داده یا گرفته می‌شود. این روش روی خودِ فاکتور به‌عنوان
   * پرداخت ثبت می‌شود (منفی = برگشتِ وجه). پیش‌فرض نقدی.
   */
  @IsOptional()
  @IsIn(['CASH', 'CARD'])
  settlementMethod?: 'CASH' | 'CARD';

  /** قلم‌های تازه‌ای که به همین فاکتور اضافه می‌شوند. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CorrectionAddLineDto)
  addedLines?: CorrectionAddLineDto[];

  /**
   * تعدیلِ دستی (ریال) — مدیر سرِ پیشخوان اختلافِ نهایی را چانه می‌زند یا
   * گرد می‌کند. مثبت = مبلغِ فاکتور بیشتر می‌شود، منفی کمتر. به amountAdjust
   * اضافه می‌شود، پس فاکتور و دفتر با همان یک عدد سند می‌خوانند.
   */
  @IsOptional()
  @IsInt()
  @Min(-INT4_MAX)
  @Max(INT4_MAX)
  manualAdjust?: number;
}
