import {
  IsBoolean,
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

import { ChequeDto } from './create-invoice.dto';
import { INT4_MAX } from '../../common/money';


/**
 * دریافت وجه از مشتری بابت بدهی قبلی.
 *
 * قبلاً بدنه‌ی این اندپوینت یک interface بود، نه کلاس. `ValidationPipe` برای
 * تایپی که در زمان اجرا وجود ندارد اصلاً اجرا نمی‌شود، پس هر چیزی — مبلغِ رشته‌ای،
 * روشِ نامعتبر، عددِ خارج از برد Int — مستقیم به سرویس و از آنجا به Prisma
 * می‌رسید. این کلاس همان مرز را برمی‌گرداند.
 */
export class CreateReceiptDto {

  /** کلید یکتای کلاینت؛ ارسال دوباره رسید تکراری نمی‌سازد. */
  @IsOptional()
  @IsString()
  idempotencyKey?:string;


  @IsString()
  customerId:string;


  /** ریال. صفر و منفی بی‌معناست؛ سقف هم برد ستون Int است. */
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  amount:number;


  /** نسیه روشِ دریافت وجه نیست — سرویس هم جداگانه ردش می‌کند. */
  @IsEnum(PaymentMethod)
  method:PaymentMethod;


  @IsOptional()
  @IsString()
  note?:string;


  /**
   * اجازه‌ی ثبتِ مازاد به‌عنوان پیش‌دریافت. پیش‌فرض خاموش است تا یک صفرِ اضافه
   * بی‌سروصدا مشتری را بستانکار نکند.
   */
  @IsOptional()
  @IsBoolean()
  allowOverpayment?:boolean;


  @IsOptional()
  @ValidateNested()
  @Type(() => ChequeDto)
  cheque?:ChequeDto;
}
