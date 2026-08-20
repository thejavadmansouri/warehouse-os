import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * ثبتِ کسری — کالایی که مشتری خواست و نداشتیم.
 *
 * `productId` اختیاری است و `productName` اجباری: نیمی از این تقاضاها برای
 * کالایی است که اصلاً در کاتالوگ نیست، و همان‌ها مهم‌ترین‌اند. اگر نامِ کالا هم
 * اجباری نبود، رکوردی می‌ماند که هیچ‌کس نمی‌فهمد درباره‌ی چه بوده.
 */
export class CreateShortageDto {

  @IsOptional()
  @IsString()
  productId?:string;


  @IsString()
  @MinLength(2)
  productName:string;


  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity?:number;


  @IsOptional()
  @IsString()
  customerId?:string;


  @IsString()
  warehouseId:string;


  @IsOptional()
  @IsString()
  note?:string;
}


/** تغییرِ وضعیت — «سفارش دادم» یا «تهیه نمی‌کنیم». */
export class ResolveShortageDto {

  @IsString()
  status:'ORDERED' | 'DISMISSED';


  @IsOptional()
  @IsString()
  note?:string;
}
