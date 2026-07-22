import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateProductDto {

  @IsString()
  name:string;


  @IsString()
  sku:string;


  @IsOptional()
  @IsString()
  internalBarcode?:string;


  @IsOptional()
  @IsString()
  factoryBarcode?:string;


  @IsOptional()
  @IsString()
  partNumber?:string;


  @IsOptional()
  @IsString()
  brandId?:string;


  @IsOptional()
  @IsString()
  categoryId?:string;


  @IsOptional()
  @IsString()
  vehicleModelId?:string;


  @IsOptional()
  @IsNumber()
  purchasePrice?:number;


  @IsOptional()
  @IsNumber()
  salePrice?:number;


  @IsOptional()
  @IsNumber()
  minStock?:number;


  @IsOptional()
  @IsString()
  image?:string;

}
