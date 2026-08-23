import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../sales/ledger.service';
import { SmsSender } from './sms-sender';
import { SmsService } from './sms.service';
import { SMS_TEMPLATES } from './sms-templates';

/**
 * چیزی که این تست‌ها محافظت می‌کنند: **قالبی که مدیر ویرایش می‌کند، دامنه‌ی
 * ویرایشش از قبل مشخص است.**
 *
 * `key` قراردادِ کد است و نباید عوض شود؛ متنِ پوچ قالب، پیامکِ پوچ می‌سازد.
 * پس ویرایش فقط عنوان/متن/وضعیت را می‌پذیرد و متنِ کوتاه‌تر از ۵ کاراکتر
 * پیش از هر نوشتن در دیتابیس رد می‌شود.
 */
describe('SmsService.updateTemplate', () => {
  let service: SmsService;

  const prisma: any = {
    smsTemplate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const sender = { sendText: jest.fn() };
  const ledger = { balance: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.smsTemplate.findUnique.mockResolvedValue({
      id: 't1',
      key: 'debt_reminder',
      title: 'یادآوری بدهی',
      body: '{customer} عزیز، مانده {balance} تومان',
      isActive: true,
    });
    prisma.smsTemplate.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({
        id: where.id,
        key: 'debt_reminder',
        title: data.title,
        body: data.body,
        isActive: data.isActive,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsSender, useValue: sender },
        { provide: LedgerService, useValue: ledger },
      ],
    }).compile();

    service = module.get(SmsService);
  });

  it('تغییر عنوان و وضعیت اعمال می‌شود — کلید دست نمی‌خورد', async () => {
    const r = await service.updateTemplate('t1', {
      title: 'یادآوری طلب',
      isActive: false,
    });

    expect(r.title).toBe('یادآوری طلب');
    expect(r.isActive).toBe(false);

    const call = prisma.smsTemplate.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 't1' });
    expect(call.data.title).toBe('یادآوری طلب');
    expect(call.data.isActive).toBe(false);
    // body نفرستاده شده — نباید در data باشد.
    expect(call.data.body).toBeUndefined();
  });

  it('متنِ کوتاه با EMPTY_BODY رد می‌شود و چیزی در دیتابیس عوض نمی‌شود', async () => {
    const e = await service.updateTemplate('t1', { body: 'abc' }).catch((x) => x);

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getResponse().error).toBe('EMPTY_BODY');
    expect(e.getResponse().message).toBe('متن قالب خالی است');
    expect(prisma.smsTemplate.update).not.toHaveBeenCalled();
  });

  it('متنِ فقط-فاصله هم مثل متنِ کوتاه رد می‌شود', async () => {
    const e = await service.updateTemplate('t1', { body: '   ' }).catch((x) => x);

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getResponse().error).toBe('EMPTY_BODY');
    expect(prisma.smsTemplate.update).not.toHaveBeenCalled();
  });

  it('متنِ معتبر با حذفِ فاصله‌های دورِ آن ذخیره می‌شود', async () => {
    const r = await service.updateTemplate('t1', { body: '  سلام {customer} عزیز  ' });

    expect(r.body).toBe('سلام {customer} عزیز');
  });
});

describe('SmsService.listTemplatesWithMeta', () => {
  let service: SmsService;

  const prisma: any = {
    smsTemplate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const sender = { sendText: jest.fn() };
  const ledger = { balance: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    // متنِ دیتابیس عمداً با تعریف فرق دارد — مدیر آن را ویرایش کرده.
    prisma.smsTemplate.findMany.mockResolvedValue([
      {
        id: 't1',
        key: 'debt_reminder',
        title: 'یادآوری بدهی',
        body: '{customer} عزیز، مانده شما ۵۰,۰۰۰ تومان',
        isActive: true,
      },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsSender, useValue: sender },
        { provide: LedgerService, useValue: ledger },
      ],
    }).compile();

    service = module.get(SmsService);
  });

  it('vars و متنِ پیش‌فرض از تعریف قالب می‌آیند، متنِ ویرایش‌شده دست‌نخورده می‌ماند', async () => {
    const seed = SMS_TEMPLATES.find((t) => t.key === 'debt_reminder')!;

    const rows = await service.listTemplatesWithMeta();

    expect(rows).toHaveLength(1);
    expect(rows[0].vars).toEqual(seed.vars);
    expect(rows[0].defaultBody).toBe(seed.body);
    expect(rows[0].body).toBe('{customer} عزیز، مانده شما ۵۰,۰۰۰ تومان');
  });

  it('قالبی که در تعریف نیست — vars خالی و بدون defaultBody', async () => {
    prisma.smsTemplate.findMany.mockResolvedValue([
      { id: 't9', key: 'custom_key', title: 'x', body: 'y', isActive: true },
    ]);

    const rows = await service.listTemplatesWithMeta();

    expect(rows[0].vars).toEqual([]);
    expect(rows[0].defaultBody).toBeUndefined();
  });
});
