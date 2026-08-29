import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';


/** توضیحِ تازه‌ی یک ردیفِ فاکتور. رشته‌ی خالی یعنی «پاکش کن». */
export class LineNoteDto {

  /** شناسه‌ی ردیفِ SALE (InventoryLog) در همان فاکتور. */
  @IsString()
  saleLogId:string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lineNote?:string;
}


export class UpdateLineNotesDto {

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LineNoteDto)
  notes:LineNoteDto[];
}
