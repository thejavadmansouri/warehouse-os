import { IsOptional, IsString, MaxLength } from 'class-validator';


export class ShopSettingsDto {

  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(60)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsString() @MaxLength(40)
  cardNumber?: string;

  @IsOptional() @IsString() @MaxLength(120)
  cardHolder?: string;

  @IsOptional() @IsString() @MaxLength(300)
  footer?: string;
}
