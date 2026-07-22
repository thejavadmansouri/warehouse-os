import { IsString, IsInt, Min, IsOptional } from 'class-validator';


export class ScanOutDto {

  @IsString()
  barcode:string;


  @IsString()
  locationId:string;


  @IsInt()
  @Min(1)
  quantity:number;


  @IsOptional()
  @IsString()
  note?:string;


  @IsOptional()
  @IsString()
  userId?:string;

}
