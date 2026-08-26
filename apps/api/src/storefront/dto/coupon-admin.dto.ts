import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { CouponType } from '@prisma/client';

/**
 * مبالغ (value برای FIXED، minSubtotal، maxDiscount) به **ریال** (واحدِ ذخیره)
 * می‌آیند — همان واحدی که همه‌ی جدول‌ها با آن ذخیره می‌کنند.
 */
export class CreateCouponDto {
  // بدون فاصله؛ سرویس حروف را بزرگ می‌کند.
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/, { message: 'کد فقط حروف/رقم/خط تیره، ۲ تا ۴۰ نویسه' })
  code!: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @Type(() => Number) @IsInt() @Min(1)
  value!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  minSubtotal?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  maxDiscount?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  usageLimit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  perCustomer?: number;

  @IsOptional() @IsDateString()
  startsAt?: string;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  value?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  minSubtotal?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  maxDiscount?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  usageLimit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  perCustomer?: number;

  @IsOptional() @IsDateString()
  startsAt?: string;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
