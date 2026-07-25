import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { LocationLevel } from '@prisma/client';
 
export class CreateLocationTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'نام نوع موقعیت الزامی است' })
  name: string;
 
  @IsEnum(LocationLevel, { message: 'سطح موقعیت نامعتبر است' })
  level: LocationLevel;
}
 