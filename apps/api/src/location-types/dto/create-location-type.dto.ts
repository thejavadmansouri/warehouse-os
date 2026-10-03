import { IsString, IsNotEmpty, IsInt, Min, IsUUID } from 'class-validator';

export class CreateLocationTypeDto {
  @IsUUID()
  @IsNotEmpty({ message: 'شناسه انبار الزامی است' })
  warehouseId: string;

  @IsString()
  @IsNotEmpty({ message: 'نام نوع موقعیت الزامی است' })
  name: string;

  @IsInt({ message: 'عمق باید عدد صحیح باشد' })
  @Min(0, { message: 'عمق نمی‌تواند منفی باشد' })
  depth: number;
}
