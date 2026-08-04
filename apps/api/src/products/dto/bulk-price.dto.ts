import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** کدام کالاها. اگر هیچ‌کدام داده نشود، هیچ کالایی انتخاب نمی‌شود — نه همه. */
export class BulkPriceSelectDto {
  /** انتخاب دستی از جدول. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  /** همه‌ی کالاهای یک برند. */
  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  /** همان جست‌وجوی فهرست کالاها (نام/کد/شماره فنی). */
  @IsOptional()
  @IsString()
  search?: string;

  /** فقط کالاهایی که هنوز قیمت فروش ندارند — برای پرکردنِ اولیه. */
  @IsOptional()
  @IsBoolean()
  onlyWithoutSalePrice?: boolean;
}

export class BulkPriceOpDto {
  /**
   * set     — مقدار مطلق روی فیلدهای داده‌شده
   * percent — همان فیلد را درصدی کم/زیاد کن (مثلاً +۱۵٪ روی قیمت فروش)
   * markup  — قیمت فروش = قیمت خرید × (۱ + درصد/۱۰۰)
   */
  @IsIn(['set', 'percent', 'markup'])
  kind: 'set' | 'percent' | 'markup';

  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wholesalePrice?: number;

  /** برای kind=percent: روی کدام فیلد اعمال شود. */
  @IsOptional()
  @IsIn(['purchasePrice', 'salePrice', 'wholesalePrice'])
  field?: 'purchasePrice' | 'salePrice' | 'wholesalePrice';

  /**
   * درصد. محدوده عمداً بسته است: یک اشتباه تایپی روی ۳۳ هزار کالا،
   * قیمت‌ها را غیرقابل‌بازگشت خراب می‌کند.
   */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(1000)
  percent?: number;
}

export class BulkPriceDto {
  @ValidateNested()
  @Type(() => BulkPriceSelectDto)
  select: BulkPriceSelectDto;

  @ValidateNested()
  @Type(() => BulkPriceOpDto)
  op: BulkPriceOpDto;

  /** فقط بشمار و بگو چند کالا اثر می‌گیرد — بدون نوشتن. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
