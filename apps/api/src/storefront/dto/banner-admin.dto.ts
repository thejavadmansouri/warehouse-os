import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * فیلدهای متنیِ بنر. چون همراهِ فایل با multipart می‌آیند، مقادیر رشته‌اند و با
 * `@Type`/`@Transform` به عدد/بولین تبدیل می‌شوند.
 */
export class BannerMetaDto {
  @IsOptional() @IsString() @MaxLength(160)
  title?: string;

  // می‌تواند مسیرِ داخلِ سایت باشد نه فقط URL کامل، پس @IsUrl نیست.
  @IsOptional() @IsString() @MaxLength(500)
  linkUrl?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsDateString()
  startsAt?: string;

  @IsOptional() @IsDateString()
  endsAt?: string;
}
