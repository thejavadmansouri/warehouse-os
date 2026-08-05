import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';


/** یک ردیف فاکتور: کالا، مکانی که از آن کم می‌شود، تعداد و قیمت واحد. */
export class InvoiceLineDto {

  @IsString()
  productId:string;


  /**
   * قفسه‌ای که کالا از آن کم می‌شود.
   *
   * اختیاری است چون در دوره‌ی راه‌اندازی، جنس در انبار هست ولی هنوز در نرم‌افزار
   * ثبت نشده و فروشنده نمی‌داند کدام قفسه. نفرستادنش یعنی «نمی‌دانم کجاست» و
   * سرور آن را روی مکانِ سیستمیِ «موجودی ثبت‌نشده» می‌برد.
   */
  @IsOptional()
  @IsString()
  locationId?:string;


  @IsInt()
  @Min(1)
  quantity:number;


  /** قیمت واحد فروش به تومان. صفر مجاز است (کالای هدیه)، منفی نه. */
  @IsInt()
  @Min(0)
  unitPrice:number;


  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;
}


/** جزئیات چک — فقط وقتی method برابر CHEQUE است لازم می‌شود. */
export class ChequeDto {

  @IsString()
  number:string;


  @IsOptional()
  @IsString()
  bankName?:string;


  @IsOptional()
  @IsString()
  branch?:string;


  @IsOptional()
  @IsString()
  holderName?:string;


  /** تاریخ سررسید (ISO). تبدیل شمسی/میلادی سمت کلاینت انجام می‌شود. */
  @IsDateString()
  dueDate:string;
}


/**
 * یک سطر پرداخت. چند سطر یعنی تسویه‌ی ترکیبی (مثلاً نصف نقد، نصف چک).
 * CREDIT یعنی نسیه: بدهی ثبت می‌شود بدون دریافت وجه، پس amount آن در
 * paidAmount حساب نمی‌شود.
 */
export class PaymentDto {

  @IsEnum(PaymentMethod)
  method:PaymentMethod;


  @IsInt()
  @Min(0)
  amount:number;


  @IsOptional()
  @IsString()
  note?:string;


  @IsOptional()
  @ValidateNested()
  @Type(() => ChequeDto)
  cheque?:ChequeDto;
}


/**
 * مشتری جدید که همراه فاکتور ساخته می‌شود (وقتی customerId نداریم).
 * فقط نام الزامی است — باید بشود مشتری را بدون هیچ شماره‌ای ثبت کرد.
 */
export class InlineCustomerDto {

  @IsString()
  firstName:string;


  @IsOptional()
  @IsString()
  lastName?:string;


  @IsOptional()
  @IsString()
  phone?:string;
}


export class CreateInvoiceDto {

  /**
   * کلید یکتای کلاینت. ارسال دوباره‌ی همان کلید فاکتور تکراری نمی‌سازد و
   * همان فاکتور قبلی برگردانده می‌شود. برای صف آفلاین و retry شبکه لازم است.
   */
  @IsString()
  idempotencyKey:string;


  @IsString()
  warehouseId:string;


  /** مشتری اختیاری است — فروش نقدیِ گذری نباید پشت نام گیر کند. */
  @IsOptional()
  @IsString()
  customerId?:string;


  @IsOptional()
  @ValidateNested()
  @Type(() => InlineCustomerDto)
  customer?:InlineCustomerDto;


  /** تخفیف کل فاکتور به تومان (جدا از تخفیف ردیف‌ها). */
  @IsOptional()
  @IsInt()
  @Min(0)
  discount?:number;


  @IsOptional()
  @IsString()
  note?:string;


  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines:InvoiceLineDto[];


  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?:PaymentDto[];
}
