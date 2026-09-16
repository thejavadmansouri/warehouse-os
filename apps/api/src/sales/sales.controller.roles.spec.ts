import 'reflect-metadata';
import { ROLES_KEY, Role } from '../auth/roles.decorator';
import { SalesController } from './sales.controller';

/**
 * گاردهای نقشِ مسیرهای «حساب مشتری» — رگرسیونِ یک باگِ واقعی.
 *
 * `GET /sales/customers/:id/statement` قبلاً هیچ `@Roles`ای نداشت؛ یعنی هر
 * کاربرِ احرازشده‌ای — از جمله STAFF — گردشِ مالیِ هر مشتری را می‌خواند.
 * `RolesGuard` وقتی متادیتا نبیند عبور می‌دهد، پس تنها دفاع، همین دکوریتور است.
 * این تست وجودش را قفل می‌کند تا با یک بازآرایی بی‌صدا نیفتد.
 */
describe('sales controller role guards (statement endpoints)', () => {
  /**
   * `SetMetadata` متادیتا را روی خودِ تابعِ متد می‌نشد (`descriptor.value`)،
   * نه روی پراپرتیِ پروتوتایپ — همان‌جا که `RolesGuard` هم می‌خواند.
   */
  const rolesOf = (method: keyof SalesController): Role[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, SalesController.prototype[method]);

  it('statement — گردشِ حسابِ مشتری — فقط برای ADMIN/MANAGER/SALES', () => {
    expect(rolesOf('statement')).toEqual([
      Role.ADMIN,
      Role.MANAGER,
      Role.SALES,
    ]);
  });

  it('full-statement — صورت‌حسابِ کامل با اقلام — همان دسترسی', () => {
    expect(rolesOf('fullStatement')).toEqual([
      Role.ADMIN,
      Role.MANAGER,
      Role.SALES,
    ]);
  });

  it('STAFF هیچ‌کدام را نمی‌بیند', () => {
    for (const m of ['statement', 'fullStatement'] as const) {
      expect(rolesOf(m)).not.toContain(Role.STAFF);
    }
  });
});
