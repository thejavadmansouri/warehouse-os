// Read-only DB state check (run via: node prisma/db-state-check.cjs)
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function q(sql) {
  try {
    return await p.$queryRawUnsafe(sql);
  } catch (e) {
    return [{ error: e.message }];
  }
}

(async () => {
  const out = {};
  out.columns = await q(
    "select table_name,column_name from information_schema.columns where table_schema='public' and ((table_name='ProductPrice' and column_name='managerPrice') or (table_name='CustomerLedger' and column_name='reversalId')) order by table_name",
  );
  out.tables = await q(
    "select table_name from information_schema.tables where table_schema='public' and table_name='PaymentReversal'",
  );
  out.products = await q(
    'select count(*)::int as n from "Product" where "deletedAt" is null',
  );
  out.prices = await q('select count(*)::int as n from "ProductPrice"');
  out.smokeWarehouses = await q(
    'select id,name from "Warehouse" where name like \'SMOKE-%\' order by "createdAt" desc',
  );
  out.smokeCustomers = await q(
    'select count(*)::int as n from "Customer" where "firstName" like \'SMOKE-%\'',
  );
  out.reversalTable = await q('select count(*)::int as n from "PaymentReversal"');
  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});