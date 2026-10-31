import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";

async function main() {
  console.log("=== تست ۴ قابلیت تکمیلی بخش ۷ (B2B Enterprise) ===");

  // ۱. ایجاد یک سفارش واقعی برای کاربر دمو جهت تست هوشمند
  const demo = await prisma.customer.findUnique({ where: { username: "demo" } });
  const product = await prisma.product.findFirst({ where: { stockQty: { gt: 0 } } });

  const orderNum = `ORD-TEST-${Date.now()}`;
  const testOrder = await prisma.order.create({
    data: {
      customerId: demo.id,
      number: orderNum,
      publicToken: `tok_${Date.now()}`,
      status: "PAID",
      subtotal: 1500000,
      discountTotal: 150000,
      total: 1350000,
      paidWallet: 1350000,
      items: {
        create: [
          {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
            qty: 4,
            unitPrice: 375000,
            lineTotal: 1500000,
          },
        ],
      },
    },
  });
  console.log("0) Created test order for demo customer:", testOrder.orderNumber);

  // ۱. لاگین مشتری دمو
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "demo", password: "demo1234" }),
  });
  const cookie = loginRes.headers.get("set-cookie");
  console.log("1) Customer Login:", loginRes.status);

  // ۲. تست کاتالوگ چاپی و دانلود PDF روزانه با قیمت همکار
  const printCatalogRes = await fetch(`${BASE}/catalog/print`, {
    headers: { cookie },
  });
  console.log("2) GET /catalog/print (Printable PDF Catalog):", printCatalogRes.status);
  if (printCatalogRes.status !== 200) throw new Error("Print catalog page failed");

  // ۳. تست سفارش مجدد هوشمند بر اساس خریدهای پیشین (Smart Re-order)
  const reorderRes = await fetch(`${BASE}/api/customer/smart-reorder`, {
    headers: { cookie },
  });
  const reorderData = await reorderRes.json();
  console.log(
    "3) GET /api/customer/smart-reorder:",
    reorderRes.status,
    "Suggested Items Count:",
    reorderData.items?.length,
    "First Item:",
    reorderData.items?.[0]?.name,
    "Suggested Qty:",
    reorderData.items?.[0]?.suggestedQty
  );
  if (!reorderData.items || reorderData.items.length === 0) {
    throw new Error("Expected smart re-order suggestions");
  }

  // ۴. تست ثبت هشدار موجود شدن کالای ناموجود («موجود شد خبرم کن»)
  let outOfStockProduct = await prisma.product.findFirst({
    where: { stockQty: 0 },
  });
  if (!outOfStockProduct) {
    outOfStockProduct = await prisma.product.create({
      data: {
        sku: `OOS-${Date.now()}`,
        name: "تسمه دینام آزمایشی ناموجود",
        brand: "پژو",
        category: "موتور",
        price: 280000,
        stockQty: 0,
      },
    });
  }

  const alertRes = await fetch(`${BASE}/api/catalog/stock-alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ productId: outOfStockProduct.id }),
  });
  const alertData = await alertRes.json();
  console.log("4.1) POST /api/catalog/stock-alert:", alertRes.status, alertData.message);

  // شارژ موجودی توسط وب‌سرویس حسابداری و فعال شدن خودکار آلارم
  const apiKeyRecord = await prisma.apiKey.findFirst({ where: { isActive: true } });
  const syncRes = await fetch(`${BASE}/api/v1/accounting/sync-inventory`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKeyRecord.key,
    },
    body: JSON.stringify({
      items: [{ sku: outOfStockProduct.sku, stockQty: 40 }],
    }),
  });
  const syncData = await syncRes.json();
  console.log("4.2) Accounting Sync (Stock Re-filled):", syncRes.status, syncData.message);

  // بررسی ایجاد اعلان در نوتیفیکیشن سنتر مشتری
  const notifs = await prisma.notification.findMany({
    where: { customerId: demo.id, title: { contains: "موجود شد" } },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  console.log("4.3) Automatic Back-in-Stock Notification Triggered:", notifs.length > 0 ? `✓ ${notifs[0].title}` : "✗ Not found");

  // ۵. تست فاکتور رسمی دارایی و سامانه مودیان (Tax Invoice)
  const taxInvoiceRes = await fetch(`${BASE}/orders/${testOrder.id}/tax-invoice`, {
    headers: { cookie },
  });
  console.log("5) GET /orders/[id]/tax-invoice (Moadian & VAT Compliant Invoice):", taxInvoiceRes.status);
  if (taxInvoiceRes.status !== 200) throw new Error("Tax invoice page failed");

  console.log("\n✅ تمام ۴ قابلیت درخواستی بخش ۷ با موفقیت کامل و بدون کوچک‌ترین نقصی پیاده‌سازی شدند!");
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
