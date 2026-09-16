import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PaymentDto } from './create-invoice.dto';
import { INT4_MAX } from '../../common/money';

/**
 * یک قلمِ متنیِ پیش‌فاکتور سفید.
 *
 * `text` عمداً آزاد است: معنای «سفید» همین است که کارگر می‌تواند چیزی را بگوید
 * یا بنویسد که هنوز در سیستم نیست («لنت پراید جلو») و منتظر ثبت کالا نماند.
 * `suggestedPrice` هم فقط پیشنهاد است — قیمتِ نهایی را مدیر می‌گذارد.
 */
export class BlankQuotationLineDto {
  @IsString()
  @Length(1, 200)
  text: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  quantity: number;

  /** ریال. صفر مجاز است، منفی نه. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  suggestedPrice?: number;
}

/**
 * ساخت پیش‌فاکتور سفید از گوشی.
 *
 * `clientRequestId` اجباری است، چون این رکورد از صف آفلاین می‌آید: بدون کلید
 * یکتا، یک retry شبکه برگه‌ی دوم می‌ساخت و مدیر دو بار قیمت می‌گذاشت.
 */
export class CreateBlankQuotationDto {
  @IsString()
  @Length(8, 64)
  clientRequestId: string;

  /** نام آزاد مشتری — رکورد Customer ساخته نمی‌شود. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** اختیاری: اگر بدهند برگه منقضی می‌شود؛ ندادن یعنی بدون انقضا. */
  @IsOptional()
  @IsInt()
  @Min(1)
  validForMinutes?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BlankQuotationLineDto)
  lines: BlankQuotationLineDto[];
}

/**
 * یک ردیف در ذخیره‌ی مدیر: قیمت نهایی، و در همان لحظه وصل شدن به کالای واقعی.
 *
 * `productId`/`locationId` سه حالت دارند و همین سه حالت است که «null» را لازم
 * می‌کند: نیامده (دست نزن)، `null` (وصل را بردار)، رشته (وصل کن).
 */
export class SaveBlankPricesLineDto {
  @IsString()
  lineId: string;

  /** نیامدنش یعنی «قیمتِ فعلی دست نخورد»؛ عدد یعنی قیمت نهایی تازه. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  finalPrice?: number;

  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  /** اصلاح متنِ قلم توسط مدیر (غلط املاییِ گفتار صوتی). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string;
}

export class SaveBlankPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaveBlankPricesLineDto)
  lines: SaveBlankPricesLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * تبدیل برگه به فاکتور واقعی.
 *
 * ⚠️ مثل `ConvertQuotationDto` عمداً `idempotencyKey` ندارد: کلید همیشه از
 * شناسه‌ی خودِ برگه ساخته می‌شود. اگر کلاینت کلید می‌فرستاد، دو درخواستِ
 * هم‌زمان با دو کلید، دو فاکتور می‌ساختند و موجودی دو بار کم می‌شد.
 *
 * `payments` اعتبارسنجی می‌شود (نه `unknown[]`) — همان درسی که در
 * `ConvertQuotationDto` ثبت شده است.
 */
export class ConvertBlankQuotationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
