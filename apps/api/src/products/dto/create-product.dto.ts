import { IsString, IsNotEmpty } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'نام کالا الزامی است' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'کد کالا (SKU) الزامی است' })
  sku: string;
}
