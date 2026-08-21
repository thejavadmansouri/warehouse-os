import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { jwtSecret } from '../auth/jwt-secret';

/**
 * توکنِ مشتریِ سایت — عمداً از توکن کارکنان جداست.
 *
 * `RolesGuard` وقتی روی یک endpoint هیچ `@Roles` ای نباشد `true` برمی‌گرداند،
 * یعنی «هر توکن معتبری» کافی است. اگر مشتری و کارمند یک شکل توکن داشتند، توکنِ
 * یک مشتریِ سایت به هر endpointِ بدون‌نقشِ داخلی می‌رسید. دو حفاظ گذاشته شده:
 *
 *   ۱. این توکن `typ: 'customer'` دارد و `CustomerAuthGuard` جز همین را نمی‌پذیرد.
 *   ۲. `JwtStrategy`ی کارکنان `sub` را در جدول `User` می‌گردد و `typ` مشتری را
 *      صریحاً رد می‌کند — پس این توکن هیچ‌وقت به مسیرهای داخلی نمی‌رسد.
 *
 * کلید امضا همان کلید سرور است؛ جداکننده `typ` است نه کلید، تا نصب‌کننده مجبور
 * نباشد دو راز را مدیریت کند.
 */
export const CUSTOMER_TOKEN_TYPE = 'customer';

/** مشتری یک ماه وارد می‌ماند — سبد خرید نباید وسط خرید بپرد. */
export const CUSTOMER_TOKEN_TTL = '30d';

export interface CustomerTokenPayload {
  sub: string; // Customer.id
  phone: string;
  typ: typeof CUSTOMER_TOKEN_TYPE;
}

export interface CustomerPrincipal {
  customerId: string;
  phone: string;
}

@Injectable()
export class CustomerTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(customerId: string, phone: string): string {
    const payload: CustomerTokenPayload = {
      sub: customerId,
      phone,
      typ: CUSTOMER_TOKEN_TYPE,
    };
    return this.jwt.sign(payload, {
      secret: jwtSecret(),
      expiresIn: CUSTOMER_TOKEN_TTL,
    });
  }

  verify(token: string): CustomerPrincipal {
    let payload: CustomerTokenPayload;
    try {
      payload = this.jwt.verify<CustomerTokenPayload>(token, {
        secret: jwtSecret(),
      });
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'دوباره وارد شوید',
      });
    }

    // توکنِ کارمند اینجا رد می‌شود: نبودِ `typ` یعنی توکنِ داخلی است.
    if (payload?.typ !== CUSTOMER_TOKEN_TYPE || !payload.sub) {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'دوباره وارد شوید',
      });
    }

    return { customerId: payload.sub, phone: payload.phone };
  }
}

/**
 * روی endpointهایی می‌نشیند که `@Public()` هم دارند: `@Public()` گاردِ سراسریِ
 * کارکنان را رد می‌کند و این گارد به‌جایش توکنِ مشتری را می‌خواهد.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly tokens: CustomerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';

    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'NO_TOKEN',
        message: 'برای این کار باید وارد شوید',
      });
    }

    req.customer = this.tokens.verify(header.slice(7).trim());
    return true;
  }
}

/** `@CurrentCustomer() me: CustomerPrincipal` */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerPrincipal =>
    ctx.switchToHttp().getRequest().customer,
);
