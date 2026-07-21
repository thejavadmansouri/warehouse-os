import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';

export class CreateInventoryLogDto {
  @IsString()
  @IsNotEmpty({ message: 'شناسه کالا الزامی است' })
  productId: string;

  @IsString()
  @IsNotEmpty({ message: 'شناسه موقعیت الزامی است' })
  locationId: string;

  @IsInt()
  @Min(1, { message: 'تعداد باید حداقل ۱ باشد' })
  quantity: number;
}
