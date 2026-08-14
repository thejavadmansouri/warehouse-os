import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';

// نام همیشه قابل ویرایش است.
//
// کد فقط تا وقتی قابل ویرایش است که انبار هنوز هیچ موقعیتی نساخته باشد — یعنی
// لیبلی چاپ نشده. سرویس این شرط را بررسی می‌کند؛ اینجا فقط فرمتِ کد اعتبارسنجی
// می‌شود (همان قاعده‌ی CreateWarehouseDto، چون داخل کد موقعیت‌ها می‌نشیند).
export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'نام انبار نمی‌تواند خالی باشد' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'کد انبار نمی‌تواند خالی باشد' })
  @MaxLength(20)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'کد انبار فقط می‌تواند شامل حروف بزرگ انگلیسی، عدد و خط تیره باشد',
  })
  code?: string;
}
