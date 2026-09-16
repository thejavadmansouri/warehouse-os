import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * گیتِ دسترسی به بخش «فروشگاه اینترنتی».
 *
 * جدا از `RolesGuard` است چون به نقش کاری ندارد: صندوقِ مغازه فقط فروشِ حضوری
 * است و نباید ردی از سایت داشته باشد، ولی یک SALES می‌تواند صراحتاً «مدیرِ سایت»
 * شود. پس تنها شرط، پرچمِ per-userِ `canManageSite` است (در هر درخواست از DB
 * درون `JwtStrategy.validate` خوانده می‌شود).
 */
@Injectable()
export class SiteAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.canManageSite === true) {
      return true;
    }
    throw new ForbiddenException(
      'این بخش (فروشگاه اینترنتی) برای حساب شما فعال نیست',
    );
  }
}
