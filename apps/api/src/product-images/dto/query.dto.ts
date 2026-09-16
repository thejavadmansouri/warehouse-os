import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsEnum,
  IsBoolean,
} from 'class-validator';

export enum CandidateFilter {
  ALL = 'ALL',
  PENDING = 'PENDING',
  HIGH_CONFIDENCE = 'HIGH_CONFIDENCE',
  MEDIUM_CONFIDENCE = 'MEDIUM_CONFIDENCE',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  NO_IMAGE_FOUND = 'NO_IMAGE_FOUND',
}

export class ListCandidatesDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsEnum(CandidateFilter)
  filter?: CandidateFilter;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  productId?: string;
}

export class BulkActionDto {
  @IsArray()
  @IsString({ each: true })
  candidateIds!: string[];
}

export class RejectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class StartSearchDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  onlyWithoutImage?: boolean;

  @IsOptional()
  @IsString()
  brandId?: string;
}
