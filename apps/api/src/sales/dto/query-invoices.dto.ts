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


  @IsOptional()
  @IsIn(['CONFIRMED', 'CANCELLED'])
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
}


export class CancelInvoiceDto {

  @IsString()
  reason:string;
}
