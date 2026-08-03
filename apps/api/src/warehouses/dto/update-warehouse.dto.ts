import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

// کد انبار عمداً اینجا نیست: بعد از این‌که انبار موقعیت پیدا کرد تغییرناپذیر است
// (داخل کد موقعیت‌های چاپ‌شده نشسته). فقط نام قابل ویرایش است.
export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'نام انبار نمی‌تواند خالی باشد' })
  @MaxLength(100)
  name?: string;
}
