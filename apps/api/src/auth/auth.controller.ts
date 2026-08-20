import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {

  constructor(
    private authService: AuthService
  ) {}

@Public()
/*
 * ضد brute-force: حداکثر ۵ تلاش ورود در دقیقه به ازای هر IP. فقط همین مسیر —
 * بقیه‌ی API (به‌خصوص POS پرتردد) throttled نمی‌شود.
 */
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Post('login')
  async login(
    @Body() body:{
      username:string;
      password:string;
    }
  ){

    return this.authService.login(
      body.username,
      body.password
    );

  }



  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(
    @CurrentUser() user:any
  ){

    return user;

  }


  /**
   * خروج — نشست فعال را آزاد می‌کند.
   *
   * بدون این، تنها راه آزادکردن نشست ورودِ دوباره از جای دیگر بود. حالا فروشنده
   * می‌تواند صریحاً بیرون بیاید و توکنش همان لحظه بی‌اعتبار شود.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @CurrentUser() user:any
  ){

    return this.authService.logout(user.userId);

  }

}
