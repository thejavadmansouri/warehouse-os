import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * شماره خام تایپ‌شده — نرمال‌سازی و اعتبارسنجیِ واقعی در سرویس انجام می‌شود
 * (`requireMobile`)، چون همان‌جا ارقام فارسی و `+98` هم باید پذیرفته شوند و
 * یک regex در DTO آن‌ها را زودتر از موعد رد می‌کرد.
 */
export class RequestOtpDto {
  @IsString() @MinLength(10) @MaxLength(20)
  phone!: string;
}

export class VerifyOtpDto {
  @IsString() @MinLength(10) @MaxLength(20)
  phone!: string;

  @IsString() @MinLength(4) @MaxLength(8)
  code!: string;

  /** فقط برای شماره‌ای که تازه مشتری می‌شود؛ برای ورودِ دوباره بی‌اثر است. */
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;
}
