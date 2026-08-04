/**
 * پاک‌سازی داده‌ی تستی پیش از تحویل به مشتری.
 *
 * کاتالوگ (Product / ProductBarcode / ProductVehicle) و داده‌های مرجع
 * (Brand / Category / PartCatalog / VehicleModel) **دست نمی‌خورند** — آن‌ها
 * واقعی‌اند و از اکسل مشتری آمده‌اند.
 *
 * هر چیزی که تراکنشی است یا ساختار انبارِ تستی را می‌سازد پاک می‌شود، تا مشتری
 * انبار خودش را از صفر تعریف کند.
 *
 * نکته‌ی مهم: موجودی و دفترِ عملیات با هم می‌روند. اگر InventoryLog پاک شود ولی
 * ردیف‌های Inventory بمانند، عددِ انبار دیگر هیچ توضیحی پشتش ندارد.
 *
 * LocationType هم می‌رود چون `warehouseId` اجباری دارد و بدون انبار نمی‌تواند
 * باقی بماند.
 *
 * اجرا:  npx ts-node prisma/cleanup-test-data.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** حساب‌هایی که می‌مانند. بقیه‌ی کاربران تستی بوده‌اند. */
const KEEP_USERNAMES = ['admin'];

async function main() {
  const before = await counts();
  console.log('--- before ---');
  console.table(before);

  await prisma.$transaction(async (tx) => {
    // ترتیب از برگ به ریشه است تا کلید خارجی نشکند.
    await tx.cheque.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.receiptAllocation.deleteMany({});
    await tx.receipt.deleteMany({});
    await tx.inventoryLog.deleteMany({});
    await tx.saleInvoice.deleteMany({});

    await tx.quotationLine.deleteMany({});
    await tx.quotation.deleteMany({});

    await tx.pickTask.deleteMany({});
    await tx.pendingOperation.deleteMany({});

    await tx.inventorySessionLocation.deleteMany({});
    await tx.inventoryCount.deleteMany({});
    await tx.inventorySession.deleteMany({});

    await tx.inventory.deleteMany({});
    await tx.productCreationRequest.deleteMany({});
    await tx.productPrice.deleteMany({});

    // Location به خودش ارجاع می‌دهد؛ از عمیق‌ترین سطح به بالا حذف می‌شود.
    const locations = await tx.location.findMany({ select: { id: true, path: true } });
    const byDepth = [...locations].sort(
      (a, b) => (b.path?.split('>').length ?? 0) - (a.path?.split('>').length ?? 0),
    );
    for (const l of byDepth) {
      await tx.location.delete({ where: { id: l.id } });
    }

    await tx.locationType.deleteMany({});
    await tx.warehouse.deleteMany({});

    await tx.user.deleteMany({ where: { username: { notIn: KEEP_USERNAMES } } });
  });

  const after = await counts();
  console.log('--- after ---');
  console.table(after);

  const kept = await prisma.user.findMany({ select: { username: true, role: true } });
  console.log('users kept:', kept);
}

async function counts() {
  return {
    products: await prisma.product.count(),
    productBarcodes: await prisma.productBarcode.count(),
    brands: await prisma.brand.count(),
    warehouses: await prisma.warehouse.count(),
    locationTypes: await prisma.locationType.count(),
    locations: await prisma.location.count(),
    inventory: await prisma.inventory.count(),
    inventoryLogs: await prisma.inventoryLog.count(),
    inventorySessions: await prisma.inventorySession.count(),
    pendingOperations: await prisma.pendingOperation.count(),
    pickTasks: await prisma.pickTask.count(),
    invoices: await prisma.saleInvoice.count(),
    payments: await prisma.payment.count(),
    quotations: await prisma.quotation.count(),
    productPrices: await prisma.productPrice.count(),
    productRequests: await prisma.productCreationRequest.count(),
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
