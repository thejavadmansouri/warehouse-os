/**
 * بخش ۷ — Idempotency. TEST 104..113
 *
 * کلیدِ یکتا در سطح دیتابیس (`idempotencyKey @unique`) تضمین می‌کند ارسال دوباره
 * یا وقفه‌ی شبکه هیچ‌وقت فاکتور/پرداخت/حرکتِ انبارِ تکراری نسازد.
 * این بخش همان را با سناریوی واقعیِ «کاربر دوبار ثبت زد» و «برخورد همزمانِ کلید» می‌سنجد.
 */
import {
  prisma,
  sales,
  returns,
  corrections,
  baseFixture,
  makeProduct,
  makeCustomer,
  stockAt,
  uniq,
  close,
} from './harness';
import { note, errBody } from './evlog';

let f: any;
beforeAll(async () => {
  f = await baseFixture();
});
afterAll(close);

const L = (p: any, qty: number, price: number) => ({
  productId: p.id,
  locationId: f.locationId,
  quantity: qty,
  unitPrice: price,
});

function freshKey() {
  return uniq('idem');
}

describe('SECTION 7 — Idempotency', () => {
  it('T104 naive double-click: same key, same payload → one invoice, one deduction', async () => {
    const p = await makeProduct({ stock: 10 });
    const key = freshKey();
    const a: any = await sales.createInvoice(
      {
        idempotencyKey: key,
        warehouseId: f.warehouseId,
        lines: [L(p, 2, 100)],
      },
      f.userId,
    );
    const b: any = await sales.createInvoice(
      {
        idempotencyKey: key,
        warehouseId: f.warehouseId,
        lines: [L(p, 2, 100)],
      },
      f.userId,
    );
    expect(a.id).toBe(b.id);
    expect(await prisma.saleInvoice.count({ where: { id: a.id } })).toBe(1);
    expect(
      await prisma.inventoryLog.count({
        where: { invoiceId: a.id, action: 'SALE' },
      }),
    ).toBe(1);
    expect(await stockAt(p.id, f.locationId)).toBe(8);
  });

  it('T105 same key but DIFFERENT payload (user edited then resent) — still returns the original', async () => {
    const p = await makeProduct({ stock: 10 });
    const key = freshKey();
    const a: any = await sales.createInvoice(
      {
        idempotencyKey: key,
        warehouseId: f.warehouseId,
        lines: [L(p, 2, 100)],
      },
      f.userId,
    );
    const b: any = await sales.createInvoice(
      {
        idempotencyKey: key,
        warehouseId: f.warehouseId,
        lines: [L(p, 9, 999)],
      },
      f.userId,
    );
    expect(a.id).toBe(b.id);
    expect(await stockAt(p.id, f.locationId)).toBe(8); // هنوز فقط 2 واحدِ اول
  });

  it('T106 concurrent same-key creates (DB unique race) → exactly one invoice', async () => {
    const p = await makeProduct({ stock: 10 });
    const key = freshKey();
    const jobs = Array.from({ length: 10 }, (_, i) =>
      sales.createInvoice(
        {
          idempotencyKey: key,
          warehouseId: f.warehouseId,
          lines: [L(p, 1, 100)],
        } as any,
        f.userId,
      ),
    );
    const res = await Promise.allSettled(jobs);
    const ok = res.filter((r) => r.status === 'fulfilled');
    const ids = new Set(ok.map((r: any) => r.value.id));
    expect(ids.size).toBe(1);
    const invId = (ok[0] as any).value.id;
    expect(
      await prisma.inventoryLog.count({
        where: { invoiceId: invId, action: 'SALE' },
      }),
    ).toBe(1);
    // موجودی فقط 1 کم می‌شود حتی اگر 10 درخواست رقابت کرده باشند.
    expect(await stockAt(p.id, f.locationId)).toBe(9);
  });

  it('T107 idempotent return retry returns the SAME return doc, no double restock', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sales.createInvoice(
      {
        idempotencyKey: freshKey(),
        warehouseId: f.warehouseId,
        lines: [L(p, 4, 100)],
      },
      f.userId,
    );
    const line = await prisma.inventoryLog.findFirstOrThrow({
      where: { invoiceId: inv.id, action: 'SALE' },
    });
    const rkey = freshKey();
    const a: any = await returns.createReturn(
      {
        idempotencyKey: rkey,
        invoiceId: inv.id,
        refundMethod: 'CASH',
        reason: 'x',
        lines: [{ saleLogId: line.id, quantity: 2 }],
      } as any,
      f.userId,
      'ADMIN',
    );
    const before = await stockAt(p.id, f.locationId);
    const b: any = await returns.createReturn(
      {
        idempotencyKey: rkey,
        invoiceId: inv.id,
        refundMethod: 'CASH',
        reason: 'x',
        lines: [{ saleLogId: line.id, quantity: 2 }],
      } as any,
      f.userId,
      'ADMIN',
    );
    expect(a.id).toBe(b.id);
    expect(await stockAt(p.id, f.locationId)).toBe(before);
    expect(
      await prisma.saleReturn.count({ where: { invoiceId: inv.id } }),
    ).toBe(1);
  });

  it('T108 idempotent correction retry does not double-adjust', async () => {
    const p = await makeProduct({ stock: 20 });
    const inv: any = await sales.createInvoice(
      {
        idempotencyKey: freshKey(),
        warehouseId: f.warehouseId,
        lines: [L(p, 8, 100)],
      },
      f.userId,
    );
    const line = await prisma.inventoryLog.findFirstOrThrow({
      where: { invoiceId: inv.id, action: 'SALE' },
    });
    const ckey = freshKey();
    const a: any = await corrections.createCorrection(
      {
        idempotencyKey: ckey,
        invoiceId: inv.id,
        reason: 'x',
        lines: [{ saleLogId: line.id, newQuantity: 5, newUnitPrice: 100 }],
      },
      f.userId,
    );
    const stockAfter = await stockAt(p.id, f.locationId); // 20-8+3 = 15
    const b: any = await corrections.createCorrection(
      {
        idempotencyKey: ckey,
        invoiceId: inv.id,
        reason: 'x',
        lines: [{ saleLogId: line.id, newQuantity: 5, newUnitPrice: 100 }],
      },
      f.userId,
    );
    expect(a.id).toBe(b.id);
    expect(await stockAt(p.id, f.locationId)).toBe(stockAfter);
    expect(
      await prisma.saleCorrection.count({ where: { invoiceId: inv.id } }),
    ).toBe(1);
  });

  it('T109 distinct keys → distinct invoices (no false dedupe by payload)', async () => {
    const p = await makeProduct({ stock: 50 });
    const a: any = await sales.createInvoice(
      {
        idempotencyKey: freshKey(),
        warehouseId: f.warehouseId,
        lines: [L(p, 1, 100)],
      },
      f.userId,
    );
    const b: any = await sales.createInvoice(
      {
        idempotencyKey: freshKey(),
        warehouseId: f.warehouseId,
        lines: [L(p, 1, 100)],
      },
      f.userId,
    );
    expect(a.id).not.toBe(b.id);
  });

  it('T110 idempotency column is UNIQUE at the DB (schema guarantee)', async () => {
    const p = await makeProduct({ stock: 10 });
    const key = freshKey();
    await sales.createInvoice(
      {
        idempotencyKey: key,
        warehouseId: f.warehouseId,
        lines: [L(p, 1, 100)],
      },
      f.userId,
    );
    // درجِ مستقیمِ همان کلید باید با خطای یکتاییِ دیتابیس مواجه شود (P2002).
    await expect(
      prisma.saleInvoice.create({
        data: {
          idempotencyKey: key,
          warehouseId: f.warehouseId,
          subtotal: 100,
          total: 100,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('T111 REGRESSION (H-2): a missing idempotencyKey is rejected cleanly, not with a raw Prisma error', async () => {
    const p = await makeProduct({ stock: 10 });
    const invBefore = await prisma.saleInvoice.count();

    let e: any = null;
    let created = false;
    try {
      const r = await sales.createInvoice(
        { warehouseId: f.warehouseId, lines: [L(p, 1, 100)] } as any,
        f.userId,
      );
      created = !!r.id;
    } catch (x) {
      e = x;
    }

    note('T111_missing_key_after_fix', {
      invoiceCreated: created,
      errorName: e?.name ?? null,
      errorBody: e?.response ?? e?.message ?? null,
    });

    expect(created).toBe(false);
    // مهم: باید BadRequestException باشد، نه PrismaClientValidationError
    expect(e?.name).toBe('BadRequestException');
    expect(e?.response?.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await prisma.saleInvoice.count()).toBe(invBefore);
  });

  it('T111b REGRESSION (H-2): an empty / whitespace idempotencyKey is rejected too', async () => {
    const p = await makeProduct({ stock: 10 });
    for (const key of ['', '   ']) {
      await expect(
        sales.createInvoice(
          {
            idempotencyKey: key,
            warehouseId: f.warehouseId,
            lines: [L(p, 1, 100)],
          } as any,
          f.userId,
        ),
      ).rejects.toMatchObject({
        response: { error: 'IDEMPOTENCY_KEY_REQUIRED' },
      });
    }
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });
});
