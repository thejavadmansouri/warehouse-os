import { IsString } from 'class-validator';

export class FinishInventoryCountDto {

  @IsString()
  countId: string;

}
