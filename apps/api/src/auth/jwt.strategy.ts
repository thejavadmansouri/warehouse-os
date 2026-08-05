import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { jwtSecret } from './jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  /**
   * علاوه بر امضا، نشست هم بررسی می‌شود — هر حساب فقط روی یک دستگاه.
   *
   * JWT بدون حالت است و ذاتاً قابل ابطال نیست، پس هر ورود یک شناسه‌ی نشست تازه
   * روی کاربر می‌نشاند و اینجا با `sid` داخل توکن مقایسه می‌شود. توکنِ دستگاه
   * قبلی امضایش معتبر است ولی شناسه‌اش دیگر نمی‌خواند و رد می‌شود.
   *
   * هزینه‌اش یک خواندن با کلید اصلی در هر درخواست است. برای یک سرور on-prem با
   * چند کاربر ناچیز است، و در عوض کاربرِ حذف‌شده هم بلافاصله بیرون می‌افتد.
   */
  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload?.sub },
      select: { id: true, username: true, role: true, activeSessionId: true },
    });

    if (!user) {
      throw new UnauthorizedException('کاربر دیگر وجود ندارد');
    }

    // توکن‌های صادرشده پیش از افزوده‌شدن نشست `sid` ندارند و باید دوباره وارد شوند.
    if (!payload?.sid || user.activeSessionId !== payload.sid) {
      throw new UnauthorizedException({
        error: 'SESSION_REPLACED',
        message: 'این حساب روی دستگاه دیگری وارد شده است — دوباره وارد شوید',
      });
    }

    return { userId: user.id, username: user.username, role: user.role };
  }
}
