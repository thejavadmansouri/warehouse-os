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
 * پرداخت وجه به مشتری بستانکار — تسویه‌ی اعتبار او.
 *
 * قرینه‌ی CreateReceiptDto با جهتِ معکوس: رسید یعنی پول از مشتری آمده، این
 * یعنی پول از صندوق به مشتری رفته. اعتبارِ مشتری از مرجوعی/اصلاحیه/اصلاحِ
 * دستی می‌آید؛ این سند آن را مصرف می‌کند.
 *
 * نسیه اینجا بی‌معناست: «پرداخت به مشتری» یعنی پولِ واقعی از صندوق بیرون
 * می‌رود — CREDIT یعنی پولی جابه‌جا نشود.
 */
export class CreatePayoutDto {
  /** کلید یکتای کلاینت؛ ارسال دوباره پرداخت تکراری نمی‌سازد. */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsString()
  customerId: string;

  /** ریال. صفر و منفی بی‌معناست؛ سقف هم برد ستون Int است. */
  @IsInt()
  @Min(1)
  @Max(INT4_MAX)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** دلیلِ پرداخت — اختیاری؛ سندی که بعداً قابل دفاع باشد وقتی نوشته شود. */
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** فقط برای روشِ CHEQUE — مشخصات چکی که به مشتری داده می‌شود. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ChequeDto)
  cheque?: ChequeDto;

  /**
   * اجازه‌ی پرداختِ بیش از بستانکاری — حتی به مشتریِ بدونِ بستانکاری (بدهکار
   * یا تسویه). پیش‌فرض خاموش است تا مبلغِ اشتباه بی‌سروصدا مشتری را بدهکارتر
   * نکند؛ قرینه‌ی allowOverpayment در رسید. مازادِ پرداخت، بدهیِ مشتری را زیاد
   * می‌کند (پولِ داده‌شده باید برگردد).
   */
  @IsOptional()
  @IsBoolean()
  allowBeyondCredit?: boolean;
}
