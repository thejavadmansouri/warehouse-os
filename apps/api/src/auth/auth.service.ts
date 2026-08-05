import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
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

      // پسورد ادمین دیگه هاردکد ('123456') نیست چون هرکسی که سورس رو ببینه می‌دونستش.
      // اگه ADMIN_INITIAL_PASSWORD توی .env تنظیم شده باشه از همون استفاده می‌شه،
      // وگرنه یک پسورد تصادفی امن ساخته می‌شه که فقط همین یک‌بار توی لاگ چاپ می‌شه
      // تا ادمین همون بار اول لاگین کنه و عوضش کنه.
      const initialPassword =
        process.env.ADMIN_INITIAL_PASSWORD ||
        randomBytes(9).toString('base64url');

      const hashedPassword = await argon2.hash(initialPassword);

      await this.prisma.user.create({

        data: {
          username: 'admin',
          password: hashedPassword,
          fullName: 'مدیر کل سیستم',
          role: 'ADMIN',
        },

      });


      console.log(
        `✅ ادمین پیش‌فرض ساخته شد: admin / ${initialPassword} (این پسورد فقط همین یک‌بار نمایش داده می‌شه — همین حالا لاگین کن و عوضش کن)`
      );

    }

  }



  async login(
    username: string,
    pass: string
  ) {


    const user = await this.prisma.user.findUnique({

      where: {
        username,
      },

    });



    if (!user) {

      throw new UnauthorizedException(
        'نام کاربری یا رمز عبور اشتباه است.'
      );

    }



    let isMatch = false;



    // Argon2
    if (user.password.startsWith('$argon2')) {

      isMatch = await argon2.verify(
        user.password,
        pass
      );

    }



    // Migration از bcrypt قدیمی
    else if (user.password.startsWith('$2')) {

      const bcrypt = require('bcrypt');

      isMatch = await bcrypt.compare(
        pass,
        user.password
      );


      // تبدیل به Argon2 بعد از ورود موفق
      if (isMatch) {

        const newHash = await argon2.hash(pass);

        await this.prisma.user.update({

          where:{
            id:user.id,
          },

          data:{
            password:newHash,
          },

        });

      }

    }



    if (!isMatch) {

      throw new UnauthorizedException(
        'نام کاربری یا رمز عبور اشتباه است.'
      );

    }



    /*
      هر حساب فقط روی یک دستگاه.

      هر ورود یک شناسه‌ی نشستِ تازه می‌سازد و روی کاربر می‌نشیند؛ از همان لحظه
      توکن دستگاه قبلی بی‌اعتبار می‌شود و اولین درخواستش ۴۰۱ می‌گیرد.

      «آخرین ورود برنده است» عمدی است: اگر مرورگر بسته شود یا گوشی گم شود،
      کاربر پشت نشستِ مرده گیر نمی‌افتد و فقط دوباره وارد می‌شود.
    */
    const sessionId = randomUUID();

    await this.prisma.user.update({
      where:{ id:user.id },
      data:{ activeSessionId: sessionId },
    });

    const payload = {

      sub:user.id,
      username:user.username,
      role:user.role,
      sid:sessionId,

    };



    return {

      access_token:
        await this.jwtService.signAsync(payload),


      user: {

        id:user.id,
        username:user.username,
        fullName:user.fullName,
        role:user.role,

      },

    };

  }


  /** خروج: نشست فعال پاک می‌شود و توکن فعلی از همین لحظه بی‌اعتبار است. */
  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { activeSessionId: null },
    });
    return { success: true };
  }

}