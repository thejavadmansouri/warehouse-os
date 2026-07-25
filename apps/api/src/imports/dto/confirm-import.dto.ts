import { IsOptional, IsBoolean } from 'class-validator';

export class ConfirmImportDto {
  @IsOptional()
  @IsBoolean()
  createMissingEntities?: boolean = true;
}
