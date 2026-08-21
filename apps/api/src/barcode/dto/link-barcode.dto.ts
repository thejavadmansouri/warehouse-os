import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/** چسباندنِ یک بارکدِ بیرونی (کارخانه/تأمین‌کننده) به کالای موجود. */
export class LinkBarcodeDto {

  @IsString()
  productId:string;


  @IsString()
  @MinLength(3)
  barcode:string;


  /**
   * `INTERNAL` عمداً پذیرفته نمی‌شود: بارکد داخلی را سیستم موقع ساختِ کالا خودش
   * می‌سازد و روی برچسب چاپ می‌کند. ساختنِ دستی‌اش از این مسیر یعنی دو رشته
   * ادعای «بارکد داخلی» بودن می‌کنند.
   */
  @IsOptional()
  @IsIn(['FACTORY', 'QR', 'OTHER'])
  type?: 'FACTORY' | 'QR' | 'OTHER';
}
