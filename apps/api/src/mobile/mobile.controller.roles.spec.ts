import 'reflect-metadata';
import { ROLES_KEY, Role } from '../auth/roles.decorator';
import { MobileController } from './mobile.controller';
import { SalesController } from '../sales/sales.controller';

/**
 * گاردهای نقشِ «پیش‌فاکتور سفید» — مرزِ دسترسی، نه یک جزئیات.
 *
 * قاعده‌ای که این تست قفل می‌کند:
 *
 *   • ساخت برگه از گوشی برای **هر چهار نقش** باز است (کارگر کف انبار و فروشنده
 *     هر دو می‌سازند) — ولی فقط از روتِ `mobile`، که انبار را خودش انتخاب
 *     می‌کند و خروجی‌اش سه فیلد است.
 *   • قیمت‌گذاری، پیشنهاد کالا، تبدیل و لغو **فقط مدیر**. اگر STAFF یا SALES به
 *     این روت‌ها راه پیدا کند، هر کسی می‌تواند قیمت بگذارد و فاکتوری بسازد که
 *     موجودی را کم می‌کند.
 *   • کل سطح `sales/*` برای STAFF بسته می‌ماند: باز کردنِ یک روت به روی کارگر
 *     نباید بقیه‌ی سطح فروش (فاکتور، پرداخت، دفتر مشتریان) را هم باز کند.
 *
 * `SetMetadata` متادیتا را روی خودِ تابعِ متد می‌نشاند (`descriptor.value`) که
 * همان جایی است که `RolesGuard` می‌خواند.
 */
describe('blank quotation role guards', () => {
  const mobileRolesOf = (method: keyof MobileController): Role[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, MobileController.prototype[method]);

  const salesRolesOf = (method: keyof SalesController): Role[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, SalesController.prototype[method]);

  it('ساخت برگه از گوشی برای کارگر، فروشنده و مدیر باز است', () => {
    expect(mobileRolesOf('createBlankQuotation')).toEqual([
      Role.ADMIN,
      Role.MANAGER,
      Role.STAFF,
      Role.SALES,
    ]);
    expect(mobileRolesOf('myBlankQuotations')).toEqual([
      Role.ADMIN,
      Role.MANAGER,
      Role.STAFF,
      Role.SALES,
    ]);
  });

  it('قیمت‌گذاری، پیشنهاد کالا، تبدیل و لغو فقط ADMIN/MANAGER', () => {
    const managerOnly: Array<keyof SalesController> = [
      'listBlankQuotations',
      'getBlankQuotation',
      'blankQuotationSuggestions',
      'saveBlankPrices',
      'convertBlankQuotation',
      'cancelBlankQuotation',
    ];

    for (const method of managerOnly) {
      expect(salesRolesOf(method)).toEqual([Role.ADMIN, Role.MANAGER]);
    }
  });

  it('STAFF روی هیچ روتِ برگه در سطح sales راه ندارد', () => {
    expect(salesRolesOf('saveBlankPrices')).not.toContain(Role.STAFF);
    expect(salesRolesOf('convertBlankQuotation')).not.toContain(Role.STAFF);
    expect(salesRolesOf('listBlankQuotations')).not.toContain(Role.STAFF);
  });

  it('صف بازبینیِ کارگر همچنان فقط دستِ مدیر است', () => {
    expect(mobileRolesOf('pendingReview')).toEqual([Role.ADMIN, Role.MANAGER]);
    expect(mobileRolesOf('confirmReview')).toEqual([Role.ADMIN, Role.MANAGER]);
  });
});
