/**
 * تست یکپارچه E2E برای سامانه مدیریت چندانباره (Multi-Warehouse) و حواله انتقال بین‌شهری
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";

let adminCookie = "";
let centralWhId = "";
let rafsanjanWhId = "";
let testProductId = "";
let testTransferId = "";

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  assert.equal(res.status, 200, "ورود ادمین باید موفق باشد");
  adminCookie = res.headers.get("set-cookie")?.split(";")[0] || "";
}

async function testWarehousesListAndInit() {
  console.log("== ۱. تست فهرست و مقداردهی اولیه‌ی انبارهای استان کرمان ==");

  const res = await fetch(`${BASE}/api/admin/warehouses`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.warehouses.length >= 4, "حداقل ۴ انبار پیش‌فرض استان کرمان باید وجود داشته باشد");

  const central = data.warehouses.find((w) => w.isCentral);
  const rafsanjan = data.warehouses.find((w) => w.city === "رفسنجان");

  assert.ok(central, "انبار مرکزی کرمان باید ثبت شده باشد");
  assert.ok(rafsanjan, "انبار رفسنجان باید ثبت شده باشد");

  centralWhId = central.id;
  rafsanjanWhId = rafsanjan.id;

  console.log(`  ✅ انبارهای پیش‌فرض استان کرمان تأیید شدند: ${central.name} و ${rafsanjan.name}.`);
}

async function testStockAdjustmentAndShelfLocation() {
  console.log("== ۲. تست جانمایی قفسه انبار (Shelf Bin) و شمارش موجودی ==");

  // ایجاد یا دریافت کالای تستی
  let prod = await prisma.product.findFirst({ where: { isActive: true } });
  if (!prod) {
    prod = await prisma.product.create({
      data: {
        sku: "TEST-WH-FILTER",
        name: "فیلتر هوای پژو ۲۰۶ سرکان",
        brand: "پژو",
        category: "فیلتراسیون",
        partBrand: "سرکان",
        price: 180_000,
        stockQty: 50,
      },
    });
  }
  testProductId = prod.id;

  // تنظیم موجودی ۱۰۰ عدد در قفسه B-12-04 انبار مرکزی
  const shelf = "قفسه B-12-04";
  const qty = 100;

  const adjRes = await fetch(`${BASE}/api/admin/warehouses/${centralWhId}/stocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      productId: testProductId,
      quantity: qty,
      shelfLocation: shelf,
    }),
  });

  assert.equal(adjRes.status, 200);
  const adjData = await adjRes.json();
  assert.equal(adjData.stock.quantity, qty);
  assert.equal(adjData.stock.shelfLocation, shelf);

  console.log(`  ✅ کالا با موجودی ۱۰۰ عدد در لوکیشن "${shelf}" انبار مرکزی کرمان ثبت شد.`);
}

async function testStockTransferLifecycle() {
  console.log("== ۳. تست صدور و اجرای حواله جابجایی بین‌انبار (کرمان به رفسنجان) ==");

  // ۱. صدور حواله جابجایی ۳۰ عدد به مقصد رفسنجان
  const createRes = await fetch(`${BASE}/api/admin/warehouses/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      fromWarehouseId: centralWhId,
      toWarehouseId: rafsanjanWhId,
      driverName: "آقای رضایی (راننده خط کرمان-رفسنجان)",
      vehiclePlate: "۴۵ ایران ۸۸۲ ج ۱۱",
      note: "انتقال فوری جهت تأمین کسری انبار رفسنجان",
      items: [{ productId: testProductId, qty: 30 }],
    }),
  });

  assert.equal(createRes.status, 200);
  const createData = await createRes.json();
  assert.equal(createData.ok, true);
  testTransferId = createData.transfer.id;
  assert.equal(createData.transfer.status, "DRAFT");
  assert.ok(createData.transfer.number.startsWith("TRF-"));
  console.log(`  ✅ پیش‌نویس حواله با شماره ${createData.transfer.number} صادر گردید.`);

  // ۲. خروج بار از انبار مرکزی (تغییر وضعیت به IN_TRANSIT)
  const dispatchRes = await fetch(`${BASE}/api/admin/warehouses/transfers/${testTransferId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ status: "IN_TRANSIT" }),
  });
  assert.equal(dispatchRes.status, 200);

  // بررسی کسر موجودی از انبار مرکزی (۱۰۰ - ۳۰ = ۷۰)
  const centralStock = await prisma.warehouseStock.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: centralWhId,
        productId: testProductId,
      },
    },
  });
  assert.equal(centralStock.quantity, 70, "موجودی انبار مرکزی پس از خروج باید به ۷۰ کاهش یابد");
  console.log("  ✅ وضعیت حواله به IN_TRANSIT تغییر یافت و ۳۰ عدد از انبار مبدأ کسر گردید.");

  // ۳. وصول بار و تخلیه در انبار رفسنجان (تغییر وضعیت به RECEIVED)
  const receiveRes = await fetch(`${BASE}/api/admin/warehouses/transfers/${testTransferId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ status: "RECEIVED" }),
  });
  assert.equal(receiveRes.status, 200);

  // بررسی افزایش موجودی در انبار رفسنجان
  const rafsanjanStock = await prisma.warehouseStock.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: rafsanjanWhId,
        productId: testProductId,
      },
    },
  });
  assert.ok(rafsanjanStock, "رکورد موجودی در انبار مقصد باید ایجاد/به‌روزرسانی شود");
  assert.equal(rafsanjanStock.quantity, 30, "موجودی انبار رفسنجان باید ۳۰ عدد باشد");
  console.log("  ✅ بار در انبار رفسنجان تخلیه شد و موجودی انبار مقصد به ۳۰ عدد ارتقا یافت.");
}

async function cleanup() {
  console.log("== ۴. پاک‌سازی داده‌های تستی ==");
  if (testTransferId) {
    await prisma.stockTransferItem.deleteMany({ where: { transferId: testTransferId } });
    await prisma.stockTransfer.deleteMany({ where: { id: testTransferId } });
  }
  console.log("  ✅ داده‌های تست پاک‌سازی شدند.");
}

async function main() {
  try {
    await loginAdmin();
    await testWarehousesListAndInit();
    await testStockAdjustmentAndShelfLocation();
    await testStockTransferLifecycle();
    console.log("\nنتایج آزمون: تمامی سناریوهای سیستم چندانباره و جابجایی بین‌انبار با موفقیت پاس شدند! 🏬🚛✨");
  } catch (err) {
    console.error("❌ خطا در اجرای تست:", err);
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
