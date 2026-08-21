import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * کلید مشترک بین سرور انبار و سایت.
 *
 * تنها چیزی است که این دو را به هم وصل می‌کند، پس ضعیف بودنش یعنی هر کسی
 * می‌تواند کاتالوگ را بازنویسی کند یا سفارش‌های مردم را بخواند.
 */
export function syncSecret(): string {
  const s = (process.env.SYNC_SECRET ?? '').trim();

  if (s.length < 32) {
    throw new Error(
      'SYNC_SECRET تنظیم نشده یا کوتاه است (حداقل ۳۲ کاراکتر).\n' +
        'یک کلید تصادفی بسازید و در .env هر دو طرف بگذارید:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return s;
}

/**
 * نگهبانِ مسیرهای سینک.
 *
 * ⚠️ این مسیرها فقط برای ایجنتِ انبارند، نه برای مرورگر. هیچ‌وقت نباید از
 * سایتِ عمومی صدایشان زد، و هیچ‌وقت نباید CORS برایشان باز شود.
 *
 * مقایسه‌ی کلید با `timingSafeEqual` انجام می‌شود: مقایسه‌ی معمولی رشته به
 * محضِ اولین کاراکترِ متفاوت برمی‌گردد و همین اختلافِ زمان، حدس‌زدنِ کلید را
 * کاراکتر‌به‌کاراکتر ممکن می‌کند.
 */
@Injectable()
export class SyncAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const given = String(req.headers?.['x-sync-key'] ?? '');
    const want = syncSecret();

    const a = Buffer.from(given);
    const b = Buffer.from(want);

    // طول‌های نابرابر را timingSafeEqual قبول نمی‌کند و خودش می‌ترکد.
    const ok = a.length === b.length && timingSafeEqual(a, b);

    if (!ok) {
      throw new UnauthorizedException({
        error: 'BAD_SYNC_KEY',
        message: 'کلید سینک معتبر نیست',
      });
    }
    return true;
  }
}
