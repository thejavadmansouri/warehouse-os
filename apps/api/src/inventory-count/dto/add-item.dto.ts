import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class AddItemDto {

  @IsOptional()
  @IsString()
  productId?: string;


  @IsString()
  name: string;


  @IsOptional()
  @IsString()
  categoryId?: string;


  @IsOptional()
  @IsString()
  brandId?: string;


  @IsOptional()
  @IsString()
  vehicleModelId?: string;


  @IsOptional()
  @IsInt()
  @Min(0)
  goodQuantity?: number;


  @IsOptional()
  @IsInt()
  @Min(0)
  badQuantity?: number;


  @IsOptional()
  @IsString()
  note?: string;


  @IsOptional()
  @IsString()
  voiceText?: string;

}
