import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';


/** ساخت دسته — فقط نام الزامی است؛ رنگ و ترتیب پیش‌فرض دارند. */
export class CreateCustomerCategoryDto {

  @IsString()
  name: string;


  /** رنگ badge — HEX مثل `#16a34a`. */
  @IsOptional()
  @IsString()
  color?: string;


  /** ترتیب نمایش — کم‌تر اول. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}


/** ویرایش دسته. همه‌چیز اختیاری؛ نفرستادنِ یک فیلد آن را پاک نمی‌کند. */
export class UpdateCustomerCategoryDto {

  @IsOptional()
  @IsString()
  name?: string;


  @IsOptional()
  @IsString()
  color?: string;


  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;


  /** غیرفعال‌سازی — مشتری‌هایش دست نمی‌خورند، فقط از انتخاب‌های جدید می‌افتد. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
