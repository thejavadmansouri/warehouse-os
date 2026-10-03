import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Worker-submitted request to add a product not yet in the catalog. */
export class CreateProductRequestDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandName?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicles?: string[]; // compatible vehicle names (multiple)

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  /**
   * بارکد روی خودِ جعبه، وقتی کارگر اسکنش کرده ولی به هیچ کالایی وصل نبوده.
   * موقع تأیید به کالای ساخته‌شده وصل می‌شود تا همان جعبه دفعه‌ی بعد شناخته شود.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productBarcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  voiceText?: string;

  @IsOptional()
  @IsString()
  locationBarcode?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

/** Manager edits applied at approval time (all optional — corrects the request). */
export class ApproveProductRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandName?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicles?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;
}

export class RejectProductRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
