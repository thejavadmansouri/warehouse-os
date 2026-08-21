import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SmsSender } from './sms-sender';
import { SmsService } from './sms.service';
import { renderTemplate } from './sms-templates';

/**
 * چیزی که این تست‌ها محافظت می‌کنند: **پیامکی که نباید برود، نرود.**
 *
 * هر ارسال پول دارد و برگشت‌ناپذیر است. سه رد باید سمت سرور بیفتد نه در UI —
 * چون همان endpoint از اسکریپت و از صفحه‌ی دیگر هم صدا زده می‌شود.
 */
describe('SmsService', () => {
  let service: SmsService;

  const prisma: any = {
    customer: { findUnique: jest.fn() },
    customerPhone: { findMany: jest.fn() },
    smsTemplate: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    smsMessage: { create: jest.fn(), count: jest.fn(), findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    shopSettings: { findFirst: jest.fn() },
  };
  const sender = { sendText: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.SMS_DAILY_CAP;

    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', firstName: 'رضا', lastName: 'محمدی', smsOptOut: false,
    });
    prisma.customerPhone.findMany.mockResolvedValue([{ phone: '09121112233' }]);
    prisma.smsTemplate.findUnique.mockResolvedValue({ id: 't1', isActive: true, body: 'سلام {customer}', title: 'x' });
    prisma.smsMessage.count.mockResolvedValue(0);
    prisma.smsMessage.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm1', ...data }));
    prisma.shopSettings.findFirst.mockResolvedValue({ name: 'یدکی رضا' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsSender, useValue: sender },
      ],
    }).compile();

    service = module.get(SmsService);
  });

  const queue = () =>
    service.queue({ customerId: 'c1', templateKey: 'debt_reminder', body: 'متن پیام تست' });

  it('پیام معتبر در صف می‌نشیند، نه اینکه درجا فرستاده شود', async () => {
    const m = await queue();

    expect(m.status).toBe('QUEUED');
    expect(m.phone).toBe('09121112233');
    // سرور روی LAN است؛ ثبت نباید منتظر پنل پیامک بماند.
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('مشتری‌ای که انصراف داده پیامک نمی‌گیرد', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', firstName: 'رضا', smsOptOut: true });

    const e = await queue().catch(x => x);

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getResponse().error).toBe('CUSTOMER_OPTED_OUT');
    expect(prisma.smsMessage.create).not.toHaveBeenCalled();
  });

  it('مشتریِ بدون موبایل رد می‌شود — تلفن ثابت پیامک نمی‌گیرد', async () => {
    // ثابت و داخلی: هر دو باید نادیده گرفته شوند.
    prisma.customerPhone.findMany.mockResolvedValue([
      { phone: '02133445566' },
      { phone: '1234' },
    ]);

    const e = await queue().catch(x => x);

    expect(e.getResponse().error).toBe('NO_MOBILE');
    expect(prisma.smsMessage.create).not.toHaveBeenCalled();
  });

  it('بین چند شماره، اولین موبایل انتخاب می‌شود نه شماره‌ی اصلی', async () => {
    // شماره‌ی اصلیِ یک مغازه‌دار معمولاً تلفن مغازه است.
    prisma.customerPhone.findMany.mockResolvedValue([
      { phone: '02133445566' },
      { phone: '09121112233' },
    ]);

    const m = await queue();

    expect(m.phone).toBe('09121112233');
  });

  it('قالب غیرفعال ارسال نمی‌شود', async () => {
    prisma.smsTemplate.findUnique.mockResolvedValue({ id: 't1', isActive: false });
    const e = await queue().catch(x => x);
    expect(e.getResponse().error).toBe('TEMPLATE_INACTIVE');
  });

  it('سقف روزانه جلوی سوختن اعتبار را می‌گیرد', async () => {
    process.env.SMS_DAILY_CAP = '5';
    prisma.smsMessage.count.mockResolvedValue(5);

    const e = await queue().catch(x => x);

    expect(e.getResponse().error).toBe('DAILY_CAP_REACHED');
    expect(prisma.smsMessage.create).not.toHaveBeenCalled();
  });

  it('drain موفق را SENT و ناموفق را FAILED می‌کند', async () => {
    prisma.smsMessage.findMany.mockResolvedValue([
      { id: 'm1', phone: '09121112233', body: 'a' },
      { id: 'm2', phone: '09121112244', body: 'b' },
    ]);
    sender.sendText
      .mockResolvedValueOnce({ ok: true, provider: 'kavenegar', providerId: '999' })
      .mockResolvedValueOnce({ ok: false, provider: 'kavenegar', detail: 'NETWORK' });

    const r = await service.drain();

    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(prisma.smsMessage.update.mock.calls[0][0].data.status).toBe('SENT');
    expect(prisma.smsMessage.update.mock.calls[0][0].data.providerId).toBe('999');
    expect(prisma.smsMessage.update.mock.calls[1][0].data.status).toBe('FAILED');
  });

  it('پیش‌نمایش متغیرهای پرنشده را نام می‌برد', async () => {
    prisma.smsTemplate.findUnique.mockResolvedValue({
      id: 't1', isActive: true, title: 'یادآوری بدهی',
      body: '{customer} عزیز، مانده {balance} تومان. {shop}',
    });

    const p = await service.preview('c1', 'debt_reminder');

    // مدیر باید ببیند چه چیزی جای نگرفته، نه اینکه پیامکِ ناقص برود.
    expect(p.missingVars).toEqual(['balance']);
    expect(p.body).toContain('رضا محمدی');
    expect(p.body).toContain('یدکی رضا');
  });
});

describe('renderTemplate', () => {
  it('متغیرِ ناشناخته دست‌نخورده می‌ماند تا در پیش‌نمایش دیده شود', () => {
    expect(renderTemplate('سلام {name}، {unknown}', { name: 'رضا' }))
      .toBe('سلام رضا، {unknown}');
  });

  it('صفر جای‌گذاری می‌شود، حذف نمی‌شود', () => {
    // مانده‌ی صفر یک عدد معتبر است — «مانده {balance}» نباید خام بماند.
    expect(renderTemplate('مانده {balance}', { balance: 0 })).toBe('مانده 0');
  });
});
