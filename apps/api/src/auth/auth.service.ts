import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    const adminExists = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await this.prisma.user.create({
        data: {
          username: 'admin',
          password: hashedPassword,
          fullName: 'مدیر کل سیستم',
          role: 'ADMIN',
        },
      });
      console.log('✅ ادمین پیش‌فرض ساخته شد: نام کاربری: admin | رمز عبور: 123456');
    }
  }

  async login(username: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور اشتباه است.');
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور اشتباه است.');
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
