import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { ReservationService } from './reservation.service';

/**
 * چیزی که این تست‌ها محافظت می‌کنند: **یک قولِ داده‌شده دو بار شمرده نشود، و
 * یک قولِ منقضی برای همیشه جنس را قفل نکند.**
 *
 * هر دو خطا در یک جهت خراب می‌کنند — موجودیِ قابل‌فروش کمتر از واقعیت — که
 * یعنی فروشنده جنسی را که روی قفسه هست نمی‌فروشد. آن ضرر دیده نمی‌شود، فقط
 * اتفاق می‌افتد.
 */
describe('ReservationService', () => {
  let service: ReservationService;

  const prisma: any = {
    workTaskItem: { groupBy: jest.fn(), findMany: jest.fn() },
    quotationLine: { groupBy: jest.fn(), findMany: jest.fn() },
    onlineOrderLine: { groupBy: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.workTaskItem.groupBy.mockResolvedValue([]);
    prisma.quotationLine.groupBy.mockResolvedValue([]);
    prisma.onlineOrderLine.groupBy.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ReservationService);
  });

  it('سه منبع با هم جمع می‌شوند', async () => {
    prisma.workTaskItem.groupBy.mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 3 } },
    ]);
    prisma.quotationLine.groupBy.mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 2 } },
    ]);
    prisma.onlineOrderLine.groupBy.mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 5 } },
    ]);

    expect(await service.forProduct('p1')).toBe(10);
  });

  it('کالای بدون هیچ قولی صفر است، نه undefined', async () => {
    expect(await service.forProduct('p1')).toBe(0);
  });

  it('فقط قلم‌های تیک‌نخورده‌ی کار برداشت شمرده می‌شوند', async () => {
    await service.forProduct('p1');

    const where = prisma.workTaskItem.groupBy.mock.calls[0][0].where;
    // قلمِ تیک‌خورده یعنی کارگر برداشته و دیگر روی قفسه نیست.
    expect(where.status).toBe('PENDING');
    expect(where.task.status.in).toEqual(['PENDING', 'IN_PROGRESS']);
  });

  it('کارِ چیدمان رزرو نیست — جنس دارد وارد می‌شود، نه خارج', async () => {
    await service.forProduct('p1');

    expect(prisma.workTaskItem.groupBy.mock.calls[0][0].where.task.kind).toBe('PICK');
  });

  it('پیش‌فاکتورِ منقضی جنس را قفل نمی‌کند', async () => {
    const before = new Date();
    await service.forProduct('p1');
    const after = new Date();

    const q = prisma.quotationLine.groupBy.mock.calls[0][0].where.quotation;
    expect(q.status).toBe('ACTIVE');
    expect(q.convertedInvoiceId).toBeNull();
    // بدون این قید، بعد از چند ماه نیمی از انبار روی کاغذ رزرو است.
    expect(q.validUntil.gt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(q.validUntil.gt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('پیش‌فاکتوری که کار برداشت دارد دوباره شمرده نمی‌شود', async () => {
    await service.forProduct('p1');

    // همان جنس در منبعِ «کار برداشت» شمرده می‌شود؛ دوباره‌شماری یعنی موجودی
    // الکی صفر نشان داده شود.
    expect(
      prisma.quotationLine.groupBy.mock.calls[0][0].where.quotation.workTasks,
    ).toEqual({ none: {} });
  });

  it('سفارشِ سایتِ فاکتورشده دیگر رزرو نیست', async () => {
    await service.forProduct('p1');

    const o = prisma.onlineOrderLine.groupBy.mock.calls[0][0].where.order;
    // به‌محض اینکه مغازه فاکتور زد، موجودیِ واقعی کم شده — رزرو برداشته می‌شود
    // وگرنه یک کالا دو بار کسر می‌شود.
    expect(o.stockAppliedAt).toBeNull();
    expect(o.status.notIn).toContain('CANCELLED');
  });

  it('چند کالا در یک رفت‌وبرگشت، و شناسه‌ی تکراری یک بار', async () => {
    prisma.workTaskItem.groupBy.mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 1 } },
      { productId: 'p2', _sum: { quantity: 4 } },
    ]);

    const map = await service.forProducts(['p1', 'p2', 'p1']);

    expect(map.get('p1')).toBe(1);
    expect(map.get('p2')).toBe(4);
    expect(prisma.workTaskItem.groupBy.mock.calls[0][0].where.productId.in)
      .toEqual(['p1', 'p2']);
  });

  it('فهرست خالی به دیتابیس نمی‌رود', async () => {
    const map = await service.forProducts([]);

    expect(map.size).toBe(0);
    expect(prisma.workTaskItem.groupBy).not.toHaveBeenCalled();
  });
});
