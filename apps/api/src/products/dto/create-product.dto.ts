import { IsString, IsOptional } from 'class-validator';

export class CreateProductDto {

  @IsString()
  name: string;


  @IsString()
  sku: string;


  @IsOptional()
  @IsString()
  brandId?: string;


  @IsOptional()
  @IsString()
  categoryId?: string;


  @IsOptional()
  @IsString()
  vehicleModelId?: string;


  @IsOptional()
  @IsString()
  factoryBarcode?: string;


  @IsOptional()
  @IsString()
  partNumber?: string;

}
