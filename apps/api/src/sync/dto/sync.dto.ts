import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OnlineOrderStatus } from '@prisma/client';

/** یک کالای آنلاین، همان‌طور که ایجنتِ انبار می‌فرستدش. */
export class SyncProductDto {
  @IsUUID()
  id!: string;

  @IsString() @MaxLength(300)
  name!: string;

  @IsString() @MaxLength(120)
  sku!: string;

  @IsOptional() @IsString() @MaxLength(120)
  partNumber?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsString() @MaxLength(40)
  unit!: string;

  @IsOptional() @IsInt() @Min(0)
  weightGrams?: number | null;

  @IsOptional() @IsString() @MaxLength(120)
  brand?: string | null;

  @IsOptional() @IsString() @MaxLength(120)
  category?: string | null;

  @IsArray() @IsString({ each: true }) @ArrayMaxSize(40)
  vehicles!: string[];

  /** قیمت فروش به واحدِ **دیتابیس** (همان چیزی که در انبار ذخیره است). */
  @IsInt() @Min(0)
  salePrice!: number;

  /**
   * عددِ موجودی. سایت خودش آن را به باند تبدیل می‌کند و هرگز عدد را بیرون
   * نمی‌دهد — ولی برای همان تبدیل، عدد لازم است.
   */
  @IsInt()
  quantity!: number;

  @IsArray() @IsString({ each: true }) @ArrayMaxSize(10)
  images!: string[];

  /**
   * توکن‌های جست‌وجو، همان‌طور که انبار حسابشان کرده.
   *
   * دوباره‌سازی‌شان روی سایت یعنی دو پیاده‌سازیِ نرمال‌سازی فارسی که با هم
   * درمی‌روند؛ فرستادنشان مجانی است و جست‌وجوی سایت را با صندوق یکسان می‌کند.
   */
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(120)
  searchTokens!: string[];
}

export class SyncCatalogDto {
  /**
   * **عکسِ کاملِ** کاتالوگ آنلاین، نه فقط تغییرات.
   *
   * دلیلش خوداصلاحی است: در حالت delta اگر یک تغییر گم شود (کرش، قطعی شبکه)
   * آن کالا برای همیشه غلط می‌ماند و کسی هم متوجه نمی‌شود. با عکسِ کامل، هر
   * چرخه خودش را درست می‌کند. در این ابعاد (چند صد کالا) هزینه‌اش ناچیز است.
   */
  @IsArray()
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => SyncProductDto)
  products!: SyncProductDto[];

  /** واحدی که قیمت‌های بالا به آن‌اند — تا سایت بداند چطور نمایششان دهد. */
  @IsIn(['RIAL', 'TOMAN'])
  storedUnit!: 'RIAL' | 'TOMAN';
}

export class AckOrdersDto {
  @IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(500)
  ids!: string[];
}

export class OrderStatusDto {
  @IsUUID()
  id!: string;

  @IsEnum(OnlineOrderStatus)
  status!: OnlineOrderStatus;

  @IsOptional() @IsString() @MaxLength(300)
  rejectReason?: string | null;
}

export class PushStatusDto {
  @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OrderStatusDto)
  orders!: OrderStatusDto[];
}

export class SyncSettingsDto {
  @IsOptional() @IsBoolean()
  onlineEnabled?: boolean;

  @IsOptional() @IsInt() @Min(0)
  shippingFee?: number;

  @IsOptional() @IsInt() @Min(0)
  freeShipOver?: number;

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
}
