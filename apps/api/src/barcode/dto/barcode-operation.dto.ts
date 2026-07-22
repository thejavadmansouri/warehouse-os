import { IsString, IsInt, IsOptional } from 'class-validator';

export class BarcodeOperationDto {

  @IsString()
  barcode: string;


  @IsString()
  locationBarcode: string;


  @IsString()
  action: string;


  @IsInt()
  quantity: number;


  @IsOptional()
  @IsString()
  note?: string;

}
