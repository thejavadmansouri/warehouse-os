import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ChequeRateMode } from '@prisma/client';


export class ShopSettingsDto {

  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(60)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsString() @MaxLength(40)
  cardNumber?: string;

  @IsOptional() @IsString() @MaxLength(120)
  cardHolder?: string;

  @IsOptional() @IsString() @MaxLength(300)
  footer?: string;

  /**
   * پیش‌فرضِ نرخِ تفاوتِ فروشِ مدت‌دار، به پایه‌ی هزارم (bp). ۲۵۰ = ۲.۵٪
   * وقتی خودِ مشتری نرخ ندارد، صندوق این را پیشنهاد می‌دهد.
   */
  @IsOptional() @IsInt() @Min(0) @Max(10_000)
  chequeRateBp?: number;

  @IsOptional() @IsEnum(ChequeRateMode)
  chequeRateMode?: ChequeRateMode;
}
