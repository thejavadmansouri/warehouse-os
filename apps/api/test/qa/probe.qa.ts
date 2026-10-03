import {
  prisma,
  sales,
  baseFixture,
  makeProduct,
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

const sell = (over: any = {}) =>
  sales.createInvoice(
    {
      idempotencyKey: uniq('idem'),
      warehouseId: f.warehouseId,
      ...over,
    },
    f.userId,
  );

describe('PROBE — observed behaviour', () => {
  it('P-oversell', async () => {
    const p = await makeProduct({ stock: 10 });
    let e: any = null,
      inv: any = null;
    try {
      inv = await sell({
        lines: [
          {
            productId: p.id,
            locationId: f.locationId,
            quantity: 11,
            unitPrice: 100000,
          },
        ],
      });
    } catch (x) {
      e = x;
    }
    note('oversell', {
      error: errBody(e),
      invoiceTotal: inv?.total ?? null,
      invoiceStatus: inv?.status ?? null,
      stockAfter: await stockAt(p.id, f.locationId),
    });
  });

  it('P-fractional', async () => {
    const p = await makeProduct({ stock: 10 });
    let e: any = null,
      inv: any = null;
    try {
      inv = await sell({
        lines: [
          {
            productId: p.id,
            locationId: f.locationId,
            quantity: 2.5,
            unitPrice: 100,
          },
        ],
      });
    } catch (x) {
      e = x;
    }
    note('fractional_qty', {
      error: errBody(e),
      invoiceTotal: inv?.total ?? null,
      stockAfter: await stockAt(p.id, f.locationId),
    });
    // فاکتورِ ناسازگارِ حاصل از 2.5 را ابطال کن تا Audit سراسری (T050) سبز بماند.
    if (inv?.id) {
      await sales
        .cancelInvoice(inv.id, 'پروبِ فرکشنال — ابطال تستی', f.userId)
        .catch(() => {});
    }
  });

  it('P-inactive', async () => {
    const p = await makeProduct({ stock: 10, isActive: false });
    let e: any = null,
      inv: any = null;
    try {
      inv = await sell({
        lines: [
          {
            productId: p.id,
            locationId: f.locationId,
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });
    } catch (x) {
      e = x;
    }
    note('inactive_product', {
      error: errBody(e),
      sold: !!inv,
      stockAfter: await stockAt(p.id, f.locationId),
    });
  });

  it('P-deleted', async () => {
    const p = await makeProduct({ stock: 10, deleted: true });
    let e: any = null,
      inv: any = null;
    try {
      inv = await sell({
        lines: [
          {
            productId: p.id,
            locationId: f.locationId,
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });
    } catch (x) {
      e = x;
    }
    note('deleted_product', {
      error: errBody(e),
      sold: !!inv,
      stockAfter: await stockAt(p.id, f.locationId),
    });
  });

  it('P-100-concurrent', async () => {
    const p = await makeProduct({ stock: 50 });
    const res = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        sell({
          lines: [
            {
              productId: p.id,
              locationId: f.locationId,
              quantity: 1,
              unitPrice: 1000,
            },
          ],
        }),
      ),
    );
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    const failed: any = res.filter((r) => r.status === 'rejected');
    note('concurrent_100', {
      succeeded: ok,
      failed: failed.length,
      sampleErrors: failed.slice(0, 3).map((r: any) => errBody(r.reason)),
      stockAfter: await stockAt(p.id, f.locationId),
      saleLogs: await prisma.inventoryLog.count({
        where: { productId: p.id, action: 'SALE' },
      }),
      invoices: await prisma.saleInvoice.count({
        where: { lines: { some: { productId: p.id } } },
      }),
    });
  });

  it('P-negative-price-and-total-manipulation', async () => {
    const p = await makeProduct({ stock: 10 });
    let e: any = null,
      inv: any = null;
    try {
      inv = await sell({
        lines: [
          {
            productId: p.id,
            locationId: f.locationId,
            quantity: 2,
            unitPrice: -50000,
          },
        ],
      });
    } catch (x) {
      e = x;
    }
    note('negative_price_service_layer', {
      error: errBody(e),
      total: inv?.total ?? null,
      subtotal: inv?.subtotal ?? null,
    });
  });

  it('P-client-total-ignored', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [
        {
          productId: p.id,
          locationId: f.locationId,
          quantity: 2,
          unitPrice: 100000,
        },
      ],
      total: 1,
      subtotal: 1,
      paidAmount: 1, // فیلدهای جعلیِ کلاینت
    } as any);
    note('client_total_ignored', {
      total: inv.total,
      subtotal: inv.subtotal,
      paidAmount: inv.paidAmount,
    });
  });
});
