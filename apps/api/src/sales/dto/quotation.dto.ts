import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { InlineCustomerDto, PaymentDto } from './create-invoice.dto';
import { INT4_MAX } from '../../common/money';


/** یک ردیف پیش‌فاکتور. مکان اختیاری است — هنگام قیمت دادن هنوز قفسه لازم نیست. */
export class QuotationLineDto {

  @IsString()
  productId:string;


  @IsOptional()
  @IsString()
  locationId?:string;


  @IsInt()
  @Min(1)
  quantity:number;


  /** ریال. صفر مجاز است (کالای هدیه)، منفی نه. */
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  unitPrice:number;


  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;
}


/**
 * ساخت پیش‌فاکتور.
 *
 * `ArrayMaxSize` عمداً همان سقفِ فاکتور واقعی است: بدون آن یک درخواست می‌توانست
 * هزاران ردیف در یک تراکنش بسازد.
 */
export class CreateQuotationDto {

  @IsString()
  warehouseId:string;


  /**
   * کلاینت برای «مشتری نقدیِ گذری» صراحتاً `null` می‌فرستد، نه undefined.
   * `@IsOptional` هر دو را رد می‌کند، پس تایپ باید `null` را هم بپذیرد.
   */
  @IsOptional()
  @IsString()
  customerId?:string | null;


  @IsOptional()
  @ValidateNested()
  @Type(() => InlineCustomerDto)
  customer?:InlineCustomerDto;


  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;


  @IsOptional()
  @IsString()
  note?:string;


  /** مدت اعتبار به دقیقه — ۶۰ یعنی یک ساعت، ۱۴۴۰ یعنی یک شبانه‌روز. */
  @IsOptional()
  @IsInt()
  @Min(1)
  validForMinutes?:number;


  /** یا مستقیم تاریخ انقضا (ISO). اگر هر دو بیاید، این اولویت دارد. */
  @IsOptional()
  @IsDateString()
  validUntil?:string;


  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineDto)
  lines:QuotationLineDto[];
}


/** ویرایش پیش‌فاکتور فعال — همان شکل، بدون انبار (انبار عوض نمی‌شود). */
export class UpdateQuotationDto {

  @IsOptional()
  @IsString()
  customerId?:string | null;


  @IsOptional()
  @ValidateNested()
  @Type(() => InlineCustomerDto)
  customer?:InlineCustomerDto;


  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;


  @IsOptional()
  @IsString()
  note?:string;


  @IsOptional()
  @IsInt()
  @Min(1)
  validForMinutes?:number;


  @IsOptional()
  @IsDateString()
  validUntil?:string;


  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineDto)
  lines:QuotationLineDto[];
}


/**
 * تبدیل پیش‌فاکتور به فاکتور واقعی.
 *
 * ⚠️ عمداً `idempotencyKey` ندارد. قبلاً کلاینت می‌توانست کلید خودش را بفرستد و
 * همان کلید گاردِ «یک پیش‌فاکتور فقط یک بار تبدیل می‌شود» را باطل می‌کرد: دو
 * درخواستِ هم‌زمان با دو کلیدِ متفاوت، دو فاکتورِ واقعی می‌ساختند و موجودی دو بار
 * کم می‌شد. کلید حالا همیشه از شناسه‌ی خودِ پیش‌فاکتور ساخته می‌شود.
 *
 * `payments` اینجا هم اعتبارسنجی می‌شود؛ قبلاً `unknown[]` بود و بدون هیچ بررسی
 * به `createInvoice` می‌رفت — یعنی مبلغِ منفی یا روشِ ناموجود مستقیم وارد ریاضیِ
 * فاکتور می‌شد.
 */
export class ConvertQuotationDto {

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?:PaymentDto[];


  @IsOptional()
  @IsDateString()
  dueDate?:string;
}


/** تمدید اعتبار — فقط مدیر. */
export class ExtendQuotationDto {

  @IsInt()
  @Min(1)
  validForMinutes:number;
}
