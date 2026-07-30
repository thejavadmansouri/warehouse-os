import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SyncOperationItemDto {
  // client-generated UUID — idempotency key so a replayed sync never duplicates
  @IsString()
  clientRequestId: string;

  @IsOptional()
  @IsString()
  type?: string; // "IN" | "COUNT" (defaults to IN)

  @IsString()
  locationBarcode: string;

  @IsOptional()
  @IsString()
  voiceText?: string; // raw transcript captured offline

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  // if the worker resolved a product online before losing connectivity
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  deviceCreatedAt?: string;
}

export class SyncOperationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationItemDto)
  operations: SyncOperationItemDto[];
}
