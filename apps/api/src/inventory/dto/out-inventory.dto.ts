import { IsString, IsInt, Min, IsOptional } from 'class-validator';

export class OutInventoryDto {
  @IsString()
  productId: string;

  @IsString()
  locationId: string;

  @IsInt()
  @Min(1, { message: 'تعداد باید حداقل ۱ باشد' })
  quantity: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  userId?: string;
}
