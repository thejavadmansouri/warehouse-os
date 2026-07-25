import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryInventoryLogsDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsIn(['IN', 'OUT', 'TRANSFER', 'ADJUST', 'SALE', 'RETURN', 'COUNT']) action?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
}
