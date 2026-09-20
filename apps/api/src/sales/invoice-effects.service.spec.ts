import { PaymentMethod } from '@prisma/client';

import { InvoiceEffectsService } from './invoice-effects.service';

/**
 * «دلتای مبلغِ فاکتور» — فقط مرجوعیِ **نقد/کارت** را برمی‌گرداند.
 *
 * قاعده‌ای که اینجا قفل می‌شود: مرجوعیِ اعتباری خودش `total` فاکتور را کم کرده
 * (returns.service) و اصلاحیه هم `total` را در جا به‌روز می‌کند. اگر این دلتا
 * آن‌ها را هم حساب کند، مبلغ دو بار کم/زیاد می‌شود و صورت‌حسابِ مشتری غلط
 * درمی‌آید — همان باگی که یک‌بار صورتحساب را ۳۰۰۰ بیشتر نشان داد.
 */
describe('InvoiceEffectsService.deltaByInvoice', () => {
  const groupBy = jest.fn();
  const prisma: any = { saleReturn: { groupBy } };
  let service: InvoiceEffectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    groupBy.mockResolvedValue([]);
    service = new InvoiceEffectsService(prisma);
  });

  it('پرس‌وجو مرجوعیِ اعتباری را کنار می‌گذارد', async () => {
    await service.deltaByInvoice(['inv1']);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceId: { in: ['inv1'] },
          refundMethod: { not: PaymentMethod.CREDIT },
        }),
      }),
    );
  });

  it('دلتا منفیِ هر فاکتور را برمی‌گرداند و برای بی‌ورودی نقشهٔ خالی می‌دهد', async () => {
    groupBy.mockResolvedValue([
      { invoiceId: 'inv1', _sum: { refundAmount: 3_000 } },
    ]);

    const delta = await service.deltaByInvoice(['inv1']);
    expect(delta.get('inv1')).toBe(-3_000);

    // بی‌فراخوانیِ بی‌دلیل به دیتابیس.
    await expect(service.deltaByInvoice([])).resolves.toEqual(new Map());
    expect(groupBy).toHaveBeenCalledTimes(1);
  });
});
