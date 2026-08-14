import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';


/** مانده‌ی اول دوره. مبلغ می‌تواند صفر باشد («این مشتری بدهی قبلی ندارد»). */
export class OpeningBalanceDto {

  /** ریال. مثبت = مشتری بدهکار است. */
  @IsInt()
  amount:number;


  @IsOptional()
  @IsString()
  note?:string;
}


/** اصلاح دستی حساب — همیشه با دلیل. */
export class AdjustBalanceDto {

  /** ریال. مثبت بدهی را زیاد و منفی کم می‌کند. */
  @IsInt()
  amount:number;


  // دلیلِ خالی یعنی ردیفی که شش ماه بعد هیچ‌کس نمی‌تواند ازش دفاع کند.
  @IsString()
  @MinLength(3)
  reason:string;
}
