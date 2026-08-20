import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { INT4_MAX } from '../../common/money';


/** یک قلمِ فاکتور خرید: کالا، تعداد، و قیمتی که بابتش پرداخت شده. */
export class PurchaseLineDto {

  @IsString()
  productId:string;


  /**
   * قفسه‌ای که کالا رویش می‌نشیند.
   *
   * اختیاری است چون حسابدار پشت میز معمولاً نمی‌داند جنس کجا چیده می‌شود.
   * نفرستادنش یعنی «نمی‌دانم» و سرور آن را روی «انبار موقت» می‌برد تا کارگر
   * بعداً با انتقال سر جایش ببرد.
   */
  @IsOptional()
  @IsString()
  locationId?:string;


  @IsInt()
  @Min(1)
  quantity:number;


  /**
   * قیمتِ خریدِ هر واحد به ریال.
   *
   * همین عدد است که گزارش سود را از کار می‌انداخت: بدون آن
   * `SaleInvoice.profit` برای کالا null می‌ماند. صفر مجاز است (جنس هدیه یا
   * جایگزینی گارانتی)، منفی نه.
   */
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  unitPrice:number;


  /** تخفیفِ همین ردیف به ریال. */
  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;
}


export class CreatePurchaseDto {

  /** کلید یکتای کلاینت؛ ارسال دوباره سند تکراری نمی‌سازد. */
  @IsString()
  idempotencyKey:string;


  @IsString()
  warehouseId:string;


  @IsOptional()
  @IsString()
  supplierId?:string | null;


  /** شماره‌ی فاکتور روی برگه‌ی فروشنده — برای تطبیق سند با کاغذ. */
  @IsOptional()
  @IsString()
  supplierRef?:string;


  /** تاریخِ روی برگه (ISO). تبدیل شمسی سمت کلاینت انجام می‌شود. */
  @IsOptional()
  @IsDateString()
  invoiceDate?:string;


  /** تخفیفِ کلِ فاکتور به ریال، جدا از تخفیف ردیف‌ها. */
  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;


  @IsOptional()
  @IsString()
  note?:string;


  /**
   * «هشدارهای قیمت را دیدم، ثبت کن».
   *
   * سرور قیمتِ هر ردیف را با خریدِ قبلی و قیمتِ فروش می‌سنجد و اگر مشکوک بود
   * سند را ثبت نمی‌کند تا آدم تصمیم بگیرد. با این پرچم همان درخواست دوباره
   * فرستاده می‌شود و ثبت انجام می‌گیرد — و تأیید در `AuditLog` می‌ماند.
   */
  @IsOptional()
  @IsBoolean()
  confirmPriceWarnings?:boolean;


  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines:PurchaseLineDto[];
}


/** ابطال فاکتور خرید — دلیل اجباری است. */
export class CancelPurchaseDto {

  @IsString()
  @MinLength(3)
  reason:string;
}


/** فیلترهای فهرست. */
export class QueryPurchasesDto {

  @IsOptional()
  @IsString()
  warehouseId?:string;


  @IsOptional()
  @IsString()
  supplierId?:string;


  @IsOptional()
  @IsString()
  status?:string;


  /** جست‌وجو روی شماره‌ی سند یا شماره‌ی فاکتور کاغذی. */
  @IsOptional()
  @IsString()
  q?:string;


  @IsOptional()
  @IsDateString()
  from?:string;


  @IsOptional()
  @IsDateString()
  to?:string;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?:number;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?:number;
}
