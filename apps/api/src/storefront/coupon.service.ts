import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { convertMoney, CurrencyUnit } from '../common/money';

export interface CouponResult {
  ok: boolean;
  message: string;
  couponId?: string;
  code?: string;
  /** تخفیف به واحدِ سایت (تومان). */
  discount?: number;
  type?: 'PERCENT' | 'FIXED';
  value?: number;
}

interface ShopUnits {
  storedUnit: CurrencyUnit;
  unit: CurrencyUnit;
}

/**
 * اعتبارسنجی و محاسبه‌ی کوپن.
 *
 * ⚠️ همه‌ی حسابِ پول اینجا به واحدِ **سایت (تومان)** برمی‌گردد، چون مبلغِ سفارش
 * هم تومان ذخیره می‌شود. مبالغِ کوپن در DB ریال‌اند و با `convertMoney` تبدیل
 * می‌شوند — همان قاعده‌ی یکتای تبدیلِ کلِ فروشگاه.
 */
@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  private fail(message: string): CouponResult {
    return { ok: false, message };
  }

  /**
   * @param subtotalSite جمعِ سبد به واحدِ سایت (تومان) — سرور آن را می‌سازد، نه کلاینت.
   */
  async compute(
    rawCode: string,
    subtotalSite: number,
    siteCustomerId: string | null,
    shop: ShopUnits,
  ): Promise<CouponResult> {
    const code = (rawCode ?? '').trim().toUpperCase();
    if (!code) return this.fail('کد تخفیف وارد نشده است');

    const c = await this.prisma.coupon.findUnique({ where: { code } });
    const now = new Date();

    if (!c || !c.isActive) return this.fail('کد تخفیف نامعتبر است');
    if (c.startsAt && c.startsAt > now) return this.fail('این کد تخفیف هنوز فعال نشده است');
    if (c.expiresAt && c.expiresAt < now) return this.fail('این کد تخفیف منقضی شده است');
    if (c.usageLimit != null && c.usedCount >= c.usageLimit) {
      return this.fail('ظرفیت این کد تخفیف تمام شده است');
    }

    const toSite = (rial: number) => convertMoney(rial, shop.storedUnit, shop.unit);

    const minSite = toSite(c.minSubtotal);
    if (subtotalSite < minSite) {
      return this.fail(`حداقل مبلغ سبد برای این کد ${minSite.toLocaleString('fa-IR')} است`);
    }

    if (c.perCustomer != null && siteCustomerId) {
      const used = await this.prisma.onlineOrder.count({
        where: { couponId: c.id, siteCustomerId, status: { not: 'CANCELLED' } },
      });
      if (used >= c.perCustomer) {
        return this.fail('سقفِ استفاده‌ی شما از این کد پر شده است');
      }
    }

    let discount: number;
    if (c.type === 'PERCENT') {
      discount = Math.floor((subtotalSite * c.value) / 100);
      if (c.maxDiscount != null) discount = Math.min(discount, toSite(c.maxDiscount));
    } else {
      discount = toSite(c.value);
    }
    // تخفیف هرگز از جمعِ سبد بیشتر نمی‌شود (سفارشِ منفی بی‌معناست).
    discount = Math.min(discount, subtotalSite);
    if (discount <= 0) return this.fail('این کد روی سبد فعلی تخفیفی ندارد');

    return {
      ok: true,
      message: 'کد تخفیف اعمال شد',
      couponId: c.id,
      code: c.code,
      discount,
      type: c.type,
      value: c.value,
    };
  }

  /** پس از ثبتِ موفقِ سفارش با کوپن — شمارنده را یکی بالا ببر. */
  async markUsed(couponId: string) {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
