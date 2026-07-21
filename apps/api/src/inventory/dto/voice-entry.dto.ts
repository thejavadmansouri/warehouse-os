import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceEntryDto {
  @IsString()
  @IsNotEmpty({ message: 'شناسه موقعیت الزامی است' })
  locationId: string;

  @IsString()
  @IsNotEmpty({ message: 'متن صوتی الزامی است' })
  voiceText: string;
}
