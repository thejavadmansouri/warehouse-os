import { ValidationPipe } from '@nestjs/common';
import {
  ChangePasswordDto,
  ChangeRoleDto,
  CreateUserDto,
} from './user.dto';

/**
 * همان پیکربندیِ ValidationPipe سراسری که در main.ts است — تا مطمئن شویم DTO
 * نه فقط class-validator را قبول می‌کند، بلکه در مسیر واقعی هم همین‌طور رفتار
 * می‌کند (whitelist + forbidNonWhitelisted + transform).
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const validUser = {
  username: 'ali.r',
  password: '123456',
  fullName: 'علی رضایی',
  role: 'STAFF',
};

describe('user DTOs', () => {
  it('کاربر معتبر پذیرفته می‌شود', async () => {
    const dto = await pipe.transform(validUser, {
      type: 'body',
      metatype: CreateUserDto,
    });
    expect(dto).toMatchObject({
      username: 'ali.r',
      fullName: 'علی رضایی',
      role: 'STAFF',
    });
  });

  it('نام کاربری خالی رد می‌شود', async () => {
    await expect(
      pipe.transform({ ...validUser, username: '' }, { type: 'body', metatype: CreateUserDto }),
    ).rejects.toThrow();
  });

  it('رمز کوتاه‌تر از ۶ کاراکتر رد می‌شود', async () => {
    await expect(
      pipe.transform({ ...validUser, password: '12345' }, { type: 'body', metatype: CreateUserDto }),
    ).rejects.toThrow();
  });

  it('نقش نامعتبر رد می‌شود', async () => {
    await expect(
      pipe.transform(
        { ...validUser, role: 'SUPERUSER' },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toThrow();
  });

  it('فیلد اضافی (forbidNonWhitelisted) رد می‌شود', async () => {
    await expect(
      pipe.transform(
        { ...validUser, isAdmin: true },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toThrow();
  });

  it('ChangeRoleDto: نقش معتبر پذیرفته و نامعتبر رد می‌شود', async () => {
    const dto = await pipe.transform({ role: 'MANAGER' }, {
      type: 'body',
      metatype: ChangeRoleDto,
    });
    expect(dto.role).toBe('MANAGER');

    await expect(
      pipe.transform({ role: 'SUPERUSER' }, { type: 'body', metatype: ChangeRoleDto }),
    ).rejects.toThrow();
  });

  it('ChangePasswordDto: رمز کوتاه رد می‌شود', async () => {
    await expect(
      pipe.transform({ password: '123' }, { type: 'body', metatype: ChangePasswordDto }),
    ).rejects.toThrow();
  });
});
