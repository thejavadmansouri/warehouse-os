import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ChequeRateMode, CurrencyUnit } from '@prisma/client';


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

  /**
   * ⚠️ معنیِ عددهای داخل دیتابیس — نه یک ترجیح نمایشی.
   *
   * عوض‌کردنش هیچ ردیفی را بازنویسی نمی‌کند، ولی همان لحظه معنیِ کل داده را
   * عوض می‌کند: اگر قیمت‌ها ریال باشند و این روی تومان برود، هر مبلغی در پنل و
   * سایت ده برابر دیده می‌شود. فقط وقتی زده شود که داده واقعاً مهاجرت کرده باشد.
   */
  @IsOptional() @IsEnum(CurrencyUnit)
  storedUnit?: CurrencyUnit;

  /** واحدِ نمایش در پنل مدیر و صندوق فروش. */
  @IsOptional() @IsEnum(CurrencyUnit)
  panelUnit?: CurrencyUnit;

  /** واحدِ نمایش در سایت عمومی. */
  @IsOptional() @IsEnum(CurrencyUnit)
  siteUnit?: CurrencyUnit;
}
