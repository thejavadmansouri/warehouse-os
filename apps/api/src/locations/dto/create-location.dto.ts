import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty({ message: 'نام/کد موقعیت الزامی است' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'نوع موقعیت الزامی است' })
  typeId: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
