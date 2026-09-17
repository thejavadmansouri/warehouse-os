/**
 * اندازه‌ی درستِ استخر روی همین ماشین — نه حدس.
 * برای هر اندازه، ۱۰۰ فروشِ هم‌زمان با کلاینتِ مستقل اجرا می‌شود.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryOperationService } from '../../src/inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../../src/inventory/system-locations.service';
import { LedgerService } from '../../src/sales/ledger.service';
import { SalesService } from '../../src/sales/sales.service';
import { ReturnsService } from '../../src/sales/returns.service';
import { PostingService } from '../../src/vouchers/posting.service';
import {
  baseFixture,
  prisma as basePrisma,
  makeProduct,
  uniq,
  close,
} from './harness';
import { note } from './evlog';

const gw: any = { broadcast: () => {} };
const pct = (a: number[], p: number) =>
  a.slice().sort((x, y) => x - y)[
    Math.min(a.length - 1, Math.floor(a.length * p))
  ];

async function run(limit: number, maxWait: number, n = 100) {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('connection_limit', String(limit));
  url.searchParams.set('pool_timeout', '30');
  const client = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    transactionOptions: { maxWait, timeout: 20_000 },
  }) as unknown as PrismaService;

  const op = new InventoryOperationService(client, gw);
  const ledger = new LedgerService(client);
  const posting = new PostingService(client);
  const returns = new ReturnsService(client, op, ledger, gw, posting);
  const svc = new SalesService(
    client,
    op,
    ledger,
    new SystemLocationsService(),
    gw,
    posting,
    returns,
  );

  const f = await baseFixture();
  const p = await makeProduct({ stock: n });

  const lat: number[] = [];
  const t0 = Date.now();
  const res = await Promise.allSettled(
    Array.from({ length: n }, async () => {
      const s = Date.now();
      try {
        return await svc.createInvoice(
          {
            idempotencyKey: uniq('pt'),
            warehouseId: f.warehouseId,
            lines: [
              {
                productId: p.id,
                locationId: f.locationId,
                quantity: 1,
                unitPrice: 1000,
              },
            ],
          },
          f.userId,
        );
      } finally {
        lat.push(Date.now() - s);
      }
    }),
  );
  const wall = Date.now() - t0;
  const failed = res.filter((r) => r.status === 'rejected').length;
  await (client as unknown as PrismaClient).$disconnect();

  return {
    pool: limit,
    maxWaitMs: maxWait,
    failed,
    wallMs: wall,
    throughputPerSec: +(n / (wall / 1000)).toFixed(1),
    p50: pct(lat, 0.5),
    p95: pct(lat, 0.95),
    max: Math.max(...lat),
  };
}

describe('POOL TUNING', () => {
  it('find the right connection_limit for this machine', async () => {
    const rows: any[] = [];
    for (const limit of [5, 8, 12, 20, 30]) rows.push(await run(limit, 15_000));
    note('pool_tuning', rows);
    console.table(rows);
    for (const r of rows) expect(r.failed).toBe(0);
  }, 900000);
});

afterAll(close);
