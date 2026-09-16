import {
  IsBoolean,
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

  /** دسترسی به فروشگاه اینترنتی — مستقل از نقش.
   *  اگر نفرستاده شود، برای ADMIN/MANAGER خودکار true می‌شود. */
  @IsOptional()
  @IsBoolean()
  canManageSite?: boolean;
}

/** تغییر نقش کاربر — فقط مدیر. */
export class ChangeRoleDto {
  @IsEnum(Role)
  role: Role;
}

/** تغییر پرچمِ «مدیر سایت» — فقط مدیر. */
export class ChangeSiteAccessDto {
  @IsBoolean()
  canManageSite: boolean;
}

/** بازنشانی رمز کاربر — فقط مدیر. */
export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  password: string;
}
