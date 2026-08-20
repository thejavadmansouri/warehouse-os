import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

/** ساخت کاربر جدید — فقط مدیر. نقش پیش‌فرض (وقتی نفرستاده شود) STAFF است. */
export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  /** فرانت حداقل ۶ کاراکتر را در فرم اعمال می‌کند — اینجا هم همان قانون. */
  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MaxLength(100)
  fullName: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

/** تغییر نقش کاربر — فقط مدیر. */
export class ChangeRoleDto {
  @IsEnum(Role)
  role: Role;
}

/** بازنشانی رمز کاربر — فقط مدیر. */
export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  password: string;
}
