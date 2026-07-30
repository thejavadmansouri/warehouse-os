import { IsUUID, IsArray, ArrayMinSize, IsOptional } from 'class-validator';

export class GenerateLocationTreeDto {
  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'حداقل یک سطح باید مشخص شود' })
  levels: Array<{
    locationTypeId: string;
    count: number;
    naming?: 'numeric' | 'alpha';
    prefix?: string;
  }>;
}
