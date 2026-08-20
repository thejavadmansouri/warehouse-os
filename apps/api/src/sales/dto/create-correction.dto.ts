import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';


/**
 * یک قلمِ اصلاحیه. به همان ردیفِ SALEِ فاکتور قفل می‌شود؛ تعداد و قیمتِ جدید را
 * فروشنده می‌دهد، بقیه از فاکتور می‌آیند.
 */
export class CorrectionLineDto {

  /** شناسه‌ی ردیفِ SALE (InventoryLog) در فاکتور اصلی. */
  @IsString()
  saleLogId:string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  newQuantity:number;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  newUnitPrice:number;
}


export class CreateCorrectionDto {

  /** کلید یکتای کلاینت؛ ارسال دوباره اصلاحیه‌ی تکراری نمی‌سازد. */
  @IsOptional()
  @IsString()
  idempotencyKey?:string;

  /** فاکتوری که اصلاحیه برایش است — اجباری. فقط فاکتورِ نهایی (CONFIRMED). */
  @IsString()
  invoiceId:string;

  @IsString()
  reason:string;

  @IsOptional()
  @IsString()
  note?:string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CorrectionLineDto)
  lines:CorrectionLineDto[];
}