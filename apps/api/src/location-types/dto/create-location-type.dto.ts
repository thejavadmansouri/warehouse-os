import { IsString, IsNotEmpty, IsInt } from 'class-validator';

export class CreateLocationTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'نام نوع موقعیت الزامی است' })
  name: string;

  @IsInt()
  level: number;
}
