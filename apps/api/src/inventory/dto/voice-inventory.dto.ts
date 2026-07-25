import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceInventoryDto {
  @IsString()
  @IsNotEmpty({ message: 'بارکد موقعیت الزامی است' })
  locationBarcode: string;

  @IsString()
  @IsNotEmpty({ message: 'متن صوتی الزامی است' })
  text: string;

  @IsString()
  @IsNotEmpty({ message: 'شناسه جلسه الزامی است' })
  sessionId: string;
}
