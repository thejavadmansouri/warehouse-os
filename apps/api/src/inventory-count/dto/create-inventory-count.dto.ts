import { IsString, IsOptional } from 'class-validator';

export class CreateInventoryCountDto {

  @IsString()
  sessionId: string;

  @IsString()
  locationId: string;

  @IsOptional()
  @IsString()
  userId?: string;

}
