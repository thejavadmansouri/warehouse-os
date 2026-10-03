import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { PaymentMethod } from '@prisma/client';

/**
 * برگشتِ پرداخت روی یک فاکتورِ ثبت‌شده.
 *
 * سناریوی واقعیِ مغازه: جنس فروخته شد، «پرداخت کرده» زده شد، اما کارتخوان
 * تراکنش را برگشت می‌زند یا بانک رد می‌کند. فاکتور سالم است؛ فقط پول برگشته.
 * این سند پرداخت را خنثی می‌کند: مانده‌ی فاکتور به بدهی برمی‌گردد و دفترِ
 * مشتری همان لحظه بدهکار می‌شود.
 */
export class ReversePaymentDto {
  /** مبلغِ برگشتی به ریال — سقفش `paidAmount` فاکتور است (سرویس کنترل می‌کند). */
  @IsInt()
  @Min(1)
  amount!: number;

  /**
   * روشِ برگشت وجه به مشتری — معمولاً همان روشِ پرداختِ اصلی است (کارت به کارت
   * برگشت می‌خورد). نسیه اینجا بی‌معناست: برگشتِ نسیه یعنی هیچ پولی برگشته
   * نیست، پس سندی لازم ندارد.
   */
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /** چرا برگشت خورد — اختیاری؛ «کارتخوان برگشت زد»، «بانک رد کرد» و … */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** برای جلوگیری از ثبتِ دوباره با retry — همان کلید، همان سند. */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
