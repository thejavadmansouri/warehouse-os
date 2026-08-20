import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { PurchasesService } from './purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';
import { INT4_MAX } from '../common/money';
import { CreatePurchaseDto } from './dto/create-purchase.dto';


/**
 * بدلِ Prisma — فقط همان چند متدی که مسیرِ بررسی‌های پیش از تراکنش لمس می‌کند.
 * هدف این تست‌ها ریاضیِ سند و محافظ‌هاست، نه رفت‌وبرگشت با دیتابیس.
 */
function makePrisma(over: Record<string, any> = {}) {
  return {
    purchaseInvoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      ...over.purchaseInvoice,
    },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({ id: 'w1' }),
      ...over.warehouse,
    },
    location: {
      findMany: jest.fn().mockResolvedValue([]),
      ...over.location,
    },
    supplier: {
      findUnique: jest.fn().mockResolvedValue({ id: 's1' }),
      ...over.supplier,
    },
    // گاردِ قیمت: بدونِ سابقه، هیچ ردیفی مشکوک نیست — پس تست‌هایی که کاری به
    // قیمت ندارند بی‌تغییر می‌مانند.
    productPrice: {
      findMany: jest.fn().mockResolvedValue([]),
      ...over.productPrice,
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      ...over.product,
    },
    $transaction: jest.fn(),
  };
}

function dto(over: Partial<CreatePurchaseDto> = {}): CreatePurchaseDto {
  return {
    idempotencyKey: 'k1',
    warehouseId: 'w1',
    lines: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }],
    ...over,
  } as CreatePurchaseDto;
}

/** خطای پرتاب‌شده را برمی‌گرداند تا بدنه‌اش بررسی شود. */
async function thrown(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e: any) {
    return e;
  }
  throw new Error('انتظار می‌رفت خطا پرتاب شود');
}


describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: ReturnType<typeof makePrisma>;

  async function build(p = makePrisma()) {
    prisma = p;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: p },
        { provide: InventoryOperationService, useValue: { execute: jest.fn() } },
        { provide: SystemLocationsService, useValue: { staging: jest.fn() } },
      ],
    }).compile();
    service = module.get(PurchasesService);
  }

  beforeEach(() => build());


  describe('ریاضیِ مبالغ', () => {
    /*
     * جمعِ ردیف = تعداد × قیمت − تخفیف ردیف؛ مبلغ نهایی = جمع − تخفیف کل.
     * همان ترتیبی که فروش دارد — اگر این دو از هم جدا بیفتند، گزارش سود بی‌معنا
     * می‌شود چون درآمد و هزینه با دو فرمول مختلف حساب شده‌اند.
     */
    it('تخفیف بیشتر از جمع فاکتور رد می‌شود', async () => {
      const e = await thrown(() =>
        service.create(dto({ discount: 5000 })), // جمع = ۲۰۰۰
      );
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.getResponse().error).toBe('DISCOUNT_EXCEEDS_TOTAL');
    });

    it('تخفیفِ ردیف در جمع لحاظ می‌شود', async () => {
      // ۲×۱۰۰۰ − ۵۰۰ = ۱۵۰۰ ⇒ تخفیف کل ۱۵۰۰ مجاز است، ۱۵۰۱ نه.
      const lines = [{ productId: 'p1', quantity: 2, unitPrice: 1000, discount: 500 }];
      const e = await thrown(() => service.create(dto({ lines, discount: 1501 } as any)));
      expect(e.getResponse().error).toBe('DISCOUNT_EXCEEDS_TOTAL');
    });

    it('مبلغِ خارج از برد ستون Int رد می‌شود، نه اینکه به Prisma برسد', async () => {
      const lines = [{ productId: 'p1', quantity: 1000, unitPrice: INT4_MAX }];
      const e = await thrown(() => service.create(dto({ lines } as any)));
      expect(e.getResponse().error).toBe('AMOUNT_TOO_LARGE');
      expect(e.getResponse().max).toBe(INT4_MAX);
    });
  });


  describe('گاردِ قیمتِ مشکوک', () => {
    /** سابقه‌ی قیمتِ کالای p1 — گارد از همین می‌خواند. */
    const withHistory = (purchasePrice: number | null, salePrice: number | null) =>
      makePrisma({
        productPrice: {
          findMany: jest.fn().mockResolvedValue([
            { productId: 'p1', purchasePrice, salePrice },
          ]),
        },
        product: {
          findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'لنت جلو پراید' }]),
        },
      });

    it('قیمتِ ده‌برابری سند را ثبت نمی‌کند و ردیف را نام می‌برد', async () => {
      await build(withHistory(100, null));

      const e = await thrown(() =>
        service.create(dto({ lines: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }] } as any)),
      );

      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe('PRICE_WARNINGS');

      const [w] = e.getResponse().warnings;
      expect(w.kind).toBe('TENFOLD_JUMP');
      expect(w.lineIndex).toBe(0);
      expect(w.productName).toBe('لنت جلو پراید');

      // و مهم‌تر از پیام: هیچ تراکنشی باز نشده.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('با تأییدِ کاربر ثبت انجام می‌شود', async () => {
      await build(withHistory(100, null));
      prisma.$transaction.mockResolvedValue('purchase-1');

      // findOne پس از ثبت صدا زده می‌شود؛ اینجا فقط باید نشکند.
      prisma.purchaseInvoice.findUnique = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'purchase-1' });

      await service.create(
        dto({
          lines: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
          confirmPriceWarnings: true,
        } as any),
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('قیمتِ عادی اصلاً هشدار نمی‌دهد', async () => {
      await build(withHistory(1000, 1500));
      prisma.$transaction.mockResolvedValue('purchase-1');
      prisma.purchaseInvoice.findUnique = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'purchase-1' });

      await service.create(
        dto({ lines: [{ productId: 'p1', quantity: 1, unitPrice: 1100 }] } as any),
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });


  describe('محافظ‌ها', () => {
    it('انبار ناموجود ⇒ ۴۰۴ روشن، نه خطای FK', async () => {
      await build(makePrisma({ warehouse: { findUnique: jest.fn().mockResolvedValue(null) } }));
      const e = await thrown(() => service.create(dto()));
      expect(e.getResponse().error).toBe('WAREHOUSE_NOT_FOUND');
    });

    /*
     * بدون این، یک locationId از انبارِ دیگر موجودیِ همان انبار را زیاد می‌کرد —
     * همان نشتی که سمت فروش هم پیدا و بسته شد.
     */
    it('مکانی که در این انبار نیست رد می‌شود، با شماره‌ی ردیف', async () => {
      await build(makePrisma({ location: { findMany: jest.fn().mockResolvedValue([]) } }));
      const lines = [
        { productId: 'p1', quantity: 1, unitPrice: 100 },
        { productId: 'p2', quantity: 1, unitPrice: 100, locationId: 'other-wh' },
      ];
      const e = await thrown(() => service.create(dto({ lines } as any)));
      expect(e.getResponse().error).toBe('LOCATION_NOT_IN_WAREHOUSE');
      expect(e.getResponse().lineIndex).toBe(1);
    });

    it('یک کالا از یک مکان دو ردیف جدا نمی‌گیرد', async () => {
      const lines = [
        { productId: 'p1', quantity: 1, unitPrice: 100 },
        { productId: 'p1', quantity: 2, unitPrice: 100 },
      ];
      const e = await thrown(() => service.create(dto({ lines } as any)));
      expect(e.getResponse().error).toBe('DUPLICATE_LINE');
      expect(e.getResponse().lineIndex).toBe(1);
    });

    it('تأمین‌کننده‌ی ناموجود رد می‌شود', async () => {
      await build(makePrisma({ supplier: { findUnique: jest.fn().mockResolvedValue(null) } }));
      const e = await thrown(() => service.create(dto({ supplierId: 'nope' })));
      expect(e.getResponse().error).toBe('SUPPLIER_NOT_FOUND');
    });

    /*
     * ارسال دوباره‌ی همان کلید نباید سند دوم بسازد — وگرنه یک retry شبکه
     * موجودی را دو برابر وارد می‌کند.
     */
    it('کلید تکراری سند تازه نمی‌سازد', async () => {
      const p = makePrisma({
        purchaseInvoice: {
          findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        },
      });
      await build(p);
      const spy = jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'existing' } as any);

      await service.create(dto());

      expect(spy).toHaveBeenCalledWith('existing');
      expect(p.$transaction).not.toHaveBeenCalled();
    });
  });
});
