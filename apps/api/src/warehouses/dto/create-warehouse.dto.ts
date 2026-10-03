import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'نام انبار الزامی است' })
  @MaxLength(100)
  name: string;

  // کد انبار به‌عنوان prefix در کد همه‌ی موقعیت‌های زیرش می‌نشیند و روی لیبل
  // فیزیکی چاپ می‌شود؛ پس فقط حروف/عدد بزرگ و خط تیره مجاز است و بعداً تغییرناپذیر می‌شود.
  @IsString()
  @IsNotEmpty({ message: 'کد انبار الزامی است' })
  @MaxLength(20)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'کد انبار فقط می‌تواند شامل حروف بزرگ انگلیسی، عدد و خط تیره باشد',
  })
  code: string;
}
