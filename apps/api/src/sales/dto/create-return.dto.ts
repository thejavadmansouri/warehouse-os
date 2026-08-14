import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';


/**
 * یک قلمِ مرجوعی. به یک ردیفِ SALE از فاکتورِ اصلی قفل می‌شود، پس نه کالا و نه
 * قیمت را کلاینت نمی‌فرستد — هر دو از خودِ فاکتور می‌آیند. فقط «کدام ردیف» و
 * «چند تا» و «سالم یا معیوب».
 */
export class ReturnLineDto {

  /** شناسه‌ی ردیفِ SALE (InventoryLog) در فاکتور اصلی. */
  @IsString()
  saleLogId:string;


  @IsInt()
  @Min(1)
  quantity:number;


  /**
   * کالا به موجودی برگردد؟ پیش‌فرض بله (سالم). معیوب = false: فقط برگشتِ مالی
   * ثبت می‌شود و هیچ حرکتی در انبار نمی‌خورد.
   */
  @IsOptional()
  @IsBoolean()
  restock?:boolean;
}


export class CreateReturnDto {

  /**
   * کلید یکتای کلاینت. ارسال دوباره سند مرجوعیِ تکراری نمی‌سازد و همان سند قبلی
   * برگردانده می‌شود — برای retry شبکه و صف آفلاین.
   */
  @IsOptional()
  @IsString()
  idempotencyKey?:string;


  /** فاکتوری که مرجوعی برایش است — اجباری. بدون فاکتور مرجوعی وجود ندارد. */
  @IsString()
  invoiceId:string;


  /**
   * روش برگشت وجه:
   * - CASH/CARD: وجه از صندوق به مشتری برگشت داده شد.
   * - CREDIT: از حسابِ مشتری کم می‌شود (ردیف بستانکاری در دفتر) — نیازمند مشتری.
   * CHEQUE به‌عنوان روشِ برگشتِ وجه بی‌معناست و رد می‌شود.
   */
  @IsEnum(PaymentMethod)
  refundMethod:PaymentMethod;


  @IsString()
  reason:string;


  @IsOptional()
  @IsString()
  note?:string;


  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines:ReturnLineDto[];
}
