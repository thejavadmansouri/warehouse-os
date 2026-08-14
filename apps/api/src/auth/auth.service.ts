import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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


  /*
   * قفلِ ساده‌ی brute-force، در حافظه.
   *
   * سرور تک‌نمونه و on-prem است، پس Map کافی است و نیازی به Redis/وابستگیِ تازه
   * نیست. بعد از چند تلاشِ ناموفقِ پیاپی روی یک نام کاربری، آن نام برای چند دقیقه
   * قفل می‌شود. argon2 کند است ولی جایگزینِ قفل نیست.
   */
  private readonly loginAttempts = new Map<string, { count: number; lockUntil: number }>();
  private readonly MAX_FAILS = 5;
  private readonly LOCK_MS = 5 * 60_000;

  private assertNotLocked(key: string) {
    const rec = this.loginAttempts.get(key);
    if (!rec) return;

    // قفلِ منقضی پاک می‌شود، وگرنه Map با هر نام کاربریِ تصادفی بزرگ‌تر می‌ماند.
    if (rec.lockUntil && rec.lockUntil <= Date.now()) {
      this.loginAttempts.delete(key);
      return;
    }

    if (rec.lockUntil > Date.now()) {
      const seconds = Math.ceil((rec.lockUntil - Date.now()) / 1000);
      const mins = Math.max(1, Math.ceil(seconds / 60));

      /*
       * بدنه باید **آبجکت** باشد، نه رشته.
       *
       * `new HttpException('متن', 429)` بدنه را یک رشته‌ی خام JSON می‌کند. کلاینت
       * دنبال `body.error` می‌گردد و روی رشته `undefined` می‌گیرد، پس این پیام را
       * دور می‌ریخت و به‌جایش «خطای غیرمنتظره» نشان می‌داد — یعنی کاربرِ قفل‌شده
       * هیچ‌وقت نمی‌فهمید قفل شده و فکر می‌کرد رمزش کار نمی‌کند.
       */
      throw new HttpException(
        {
          error:'TOO_MANY_ATTEMPTS',
          retryAfterSeconds: seconds,
          message:`تلاش‌های ناموفقِ زیاد — ${mins} دقیقه‌ی دیگر دوباره امتحان کنید.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFail(key: string) {
    const rec = this.loginAttempts.get(key) ?? { count: 0, lockUntil: 0 };
    rec.count += 1;
    if (rec.count >= this.MAX_FAILS) {
      rec.lockUntil = Date.now() + this.LOCK_MS;
      rec.count = 0;
    }
    this.loginAttempts.set(key, rec);
  }

  private clearFails(key: string) {
    this.loginAttempts.delete(key);
  }


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

    // کلیدِ قفل — نامِ نرمال‌شده، تا «Admin» و «admin» یک حساب شمرده شوند.
    const key = (username ?? '').toLowerCase().trim();
    this.assertNotLocked(key);


    const user = await this.prisma.user.findUnique({

      where: {
        username,
      },

    });



    if (!user) {

      // نامِ ناموجود هم شمرده می‌شود تا شمارشِ نام‌های کاربری کند شود.
      this.recordFail(key);

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

      this.recordFail(key);

      throw new UnauthorizedException(
        'نام کاربری یا رمز عبور اشتباه است.'
      );

    }


    // ورودِ موفق — شمارنده‌ی تلاش‌ها صفر می‌شود.
    this.clearFails(key);



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