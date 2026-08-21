import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OnlinePayMethod } from '@prisma/client';

export class OrderLineDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number) @IsInt() @Min(1)
  quantity!: number;
}

/**
 * سبدی که مشتری ثبت می‌کند.
 *
 * ⚠️ عمداً **هیچ قیمتی** از کلاینت گرفته نمی‌شود. قیمت هر ردیف سمت سرور از
 * دیتابیس خوانده می‌شود؛ اگر کلاینت قیمت می‌فرستاد، هر کسی می‌توانست با یک
 * درخواستِ دستی لنت را یک تومان بخرد.
 */
export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  // سبدِ صدتایی از یک سایت خرده‌فروشی یعنی اسکریپت، نه مشتری.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines!: OrderLineDto[];

  @IsString() @MinLength(2) @MaxLength(120)
  receiverName!: string;

  @IsString() @MinLength(10) @MaxLength(20)
  receiverPhone!: string;

  @IsString() @MinLength(10) @MaxLength(500)
  address!: string;

  @IsOptional() @IsEnum(OnlinePayMethod)
  payMethod?: OnlinePayMethod;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /**
   * کلید یکتای کلاینت — دکمه‌ی دوبار خورده یا retryِ شبکه نباید دو سفارش بسازد.
   * اختیاری است تا کلاینتِ ساده هم کار کند، ولی سایت باید بفرستد.
   */
  @IsOptional() @IsString() @MaxLength(64)
  idempotencyKey?: string;
}
