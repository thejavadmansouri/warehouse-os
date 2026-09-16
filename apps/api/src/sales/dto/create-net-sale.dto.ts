import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsEnum,
  Min,
  Max,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

import { InvoiceLineDto, PaymentDto } from './create-invoice.dto';
import { ReturnLineDto } from './create-return.dto';
import { INT4_MAX } from '../../common/money';

/**
 * مرجوعیِ یک فاکتورِ قبلی داخلِ سبدِ خالص.
 *
 * مثل سندِ مرجوعیِ مستقل: قفل به فاکتور و ردیف‌هایِ SALE است؛ کالا و قیمت از
 * خودِ فاکتور می‌آید، کلاینت فقط «کدام ردیف» و «چند تا» و «سالم/معیوب» را می‌گوید.
 */
export class NetReturnGroupDto {
  /** فاکتورِ قبلیِ همین مشتری که کالا از آن برمی‌گردد. */
  @IsString()
  invoiceId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];
}

/**
 * سبدِ خالص — «مشتری جنسِ قبلی را پس می‌دهد و جنسِ نو می‌برد».
 *
 * همه‌چیز در **یک درخواستِ اتمیک**: فاکتورِ فروشِ ردیف‌هایِ نو + سند(های) مرجوعیِ
 * ردیف‌هایِ برگشتی (که می‌توانند از چند فاکتورِ قبلیِ همین مشتری باشند) — یا همه
 * ثبت می‌شوند یا هیچ‌کدام. وجهِ برگشتی با `refundMethod` نقد/کارت از صندوق
 * برمی‌گردد و جمعِ مرجوعی هرگز از مبلغِ خریدِ نو بیشتر نمی‌شود (خالصِ منفی در
 * این فاز مجاز نیست؛ بازپرداختِ مازاد مسیرِ payout دارد).
 */
export class CreateNetSaleDto {
  /** کلید یکتای کلِ عملیات — روی خودِ فاکتورِ فروشِ حاصل نشانه می‌شود. */
  @IsString()
  idempotencyKey: string;

  @IsString()
  warehouseId: string;

  /**
   * اجباری است چون برگشت فقط برای «فاکتورهایِ قبلیِ همین مشتری» معنا دارد —
   * سبدِ خالص یعنی ردوبدل با کسی که از ما خریده و حالا پس می‌دهد.
   */
  @IsString()
  customerId: string;

  /** تخفیف کلِ فاکتورِ نو به ریال (جدا از تخفیف ردیف‌ها). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  discount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** سررسیدِ بخش نسیه‌ی فاکتورِ نو. نفرستادنش = مهلتِ همیشگیِ مشتری. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** ردیف‌هایِ جنسِ نو — همان شکلِ ردیفِ فاکتورِ عادی. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  /**
   * پرداخت‌هایِ فاکتورِ نو. نفرستادنش = کلِ مبلغ نقد دریافت شده (پیش‌فرضِ
   * فروشِ عادی). چون مرجوعیِ همراه وجهِ نقدی برمی‌گرداند، در حالتِ عادی
   * فروشنده مبلغِ کاملِ خریدِ نو را ثبت می‌کند و برگشت از همان صندوق کم می‌شود —
   * خالصِ صندوق همان چیزی است که مشتری واقعاً داد.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];

  /**
   * روشِ برگشتِ وجه: فقط نقد/کارت (پولِ واقعی از صندوق برمی‌گردد).
   * CREDIT معنایش برگشتِ به‌حسابِ بدونِ جنسِ نو است و مسیرِ مستقلِ مرجوعی را دارد؛
   * CHEQUE هم به‌عنوان روشِ برگشت بی‌معناست. هر دو این‌جا رد می‌شوند.
   */
  @IsEnum(PaymentMethod)
  refundMethod: PaymentMethod;

  /** دلیلِ مرجوعی — اختیاری؛ اگر نوشته شود روی همه‌ی سندهایِ حاصل می‌نشیند. */
  @IsOptional()
  @IsString()
  reason?: string;

  /** فاکتورهایِ قبلی که کالا از آن‌ها برمی‌گردد — چندتایی مجاز است. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NetReturnGroupDto)
  returns: NetReturnGroupDto[];
}
