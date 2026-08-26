import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** مبالغ (fee، freeOver) به ریال (واحدِ ذخیره). */
export class CreateShippingZoneDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name!: string;

  @Type(() => Number) @IsInt() @Min(0)
  fee!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  freeOver?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateShippingZoneDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  fee?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  freeOver?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
