import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';


export class QueryInvoicesDto {

  @IsOptional()
  @IsString()
  warehouseId?:string;


  @IsOptional()
  @IsString()
  customerId?:string;


  /** جست‌وجو روی نام/تلفن مشتری و شماره‌ی فاکتور. */
  @IsOptional()
  @IsString()
  q?:string;


  /**
   * وضعیت فاکتور. علاوه بر وضعیت‌های واقعیِ مدل، `RETURNED` یک وضعیتِ مجازی است
   * (مرجوعی وضعیتِ فاکتور را عوض نمی‌کند): فاکتورهایی که دستِ‌کم یک مرجوعی خورده‌اند.
   */
  @IsOptional()
  @IsIn(['CONFIRMED', 'CANCELLED', 'RETURNED'])
  status?:string;


  @IsOptional()
  @IsDateString()
  from?:string;


  @IsOptional()
  @IsDateString()
  to?:string;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?:number;


  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?:number;


  /** وقتی true باشد، ردیف‌های فاکتور (اقلام) هم در پاسخ می‌آیند — برای کاردکس مشتری. */
  @IsOptional()
  @IsIn(['true', 'false'])
  includeLines?:string;
}


export class CancelInvoiceDto {

  @IsString()
  reason:string;
}
