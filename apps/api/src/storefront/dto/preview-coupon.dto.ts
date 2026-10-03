import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { OrderLineDto } from './create-order.dto';

/** پیش‌نمایشِ تخفیف: کد + همان سبد، تا سرور جمع را خودش حساب کند نه کلاینت. */
export class PreviewCouponDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines!: OrderLineDto[];
}
