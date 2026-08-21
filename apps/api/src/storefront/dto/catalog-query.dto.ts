import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * پارامترهای فهرست کاتالوگ.
 *
 * `forbidNonWhitelisted` سراسری است، پس هر پارامترِ ناشناخته ۴۰۰ می‌گیرد — که
 * برای یک endpoint عمومی خوب است: کسی نمی‌تواند با پارامترِ من‌درآوردی رفتار
 * کوئری را عوض کند.
 */
export class CatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(80)
  q?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsUUID()
  brandId?: string;

  @IsOptional() @IsUUID()
  vehicleModelId?: string;

  /**
   * به واحدِ **سایت** است، نه واحدِ دیتابیس — همان عددی که کاربر روی صفحه
   * می‌بیند و در فیلتر تایپ می‌کند. تبدیلش در سرویس انجام می‌شود.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  minPrice?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  maxPrice?: number;

  // از query string می‌آید، پس رشته است نه boolean: `?inStock=true`
  @IsOptional() @IsBooleanString()
  inStock?: string;

  @IsOptional() @IsIn(['newest', 'cheapest', 'expensive', 'name'])
  sort?: 'newest' | 'cheapest' | 'expensive' | 'name';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  // سقف در سرویس هم دوباره اعمال می‌شود؛ این فقط پیامِ خطای زودتر است.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48)
  pageSize?: number;
}
