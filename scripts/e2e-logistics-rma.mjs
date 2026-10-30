/**
 * تست یکپارچه E2E برای ماژول لجستیک (باربری‌های کرمان، بیجک) و مرجوعی کالا (RMA)
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";

let adminCookie = "";
let customerCookie = "";
let testCustomerId = "";
let testOrderId = "";
let testProductId = "";
let testShipmentId = "";
let testRmaId = "";

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  assert.equal(res.status, 200, "ورود ادمین باید موفق باشد");
  adminCookie = res.headers.get("set-cookie")?.split(";")[0] || "";
}

async function setupCustomerAndOrder() {
  // ۱. ایجاد مشتری تستی
  const testPhone = "09349998877";
  const existingCust = await prisma.customer.findUnique({ where: { phone: testPhone } });
  if (existingCust) {
    await prisma.rmaRequest.deleteMany({ where: { customerId: existingCust.id } });
    await prisma.shipment.deleteMany({ where: { order: { customerId: existingCust.id } } });
    await prisma.walletTransaction.deleteMany({ where: { customerId: existingCust.id } });
    await prisma.orderItem.deleteMany({ where: { order: { customerId: existingCust.id } } });
    await prisma.order.deleteMany({ where: { customerId: existingCust.id } });
    await prisma.customer.delete({ where: { id: existingCust.id } });
  }

  const customer = await prisma.customer.create({
    data: {
      phone: testPhone,
      companyName: "لوازم یدکی ستاره رفسنجان",
      contactName: "حاج علی حسینی",
      status: "ACTIVE",
      address: "رفسنجان، خیابان امیرکبیر، فروشگاه حسینی",
    },
  });
  testCustomerId = customer.id;

  // ورود مشتری با OTP
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: testPhone }),
  });
  const reqData = await reqRes.json();
  assert(reqData.devCode, "کد OTP تستی باید تولید شود");

  const otpRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: testPhone, code: reqData.devCode }),
  });
  assert.equal(otpRes.status, 200, "ورود مشتری تستی باید موفق باشد");
  customerCookie = otpRes.headers.get("set-cookie")?.split(";")[0] || "";

  // یافتن یا ایجاد یک محصول
  let prod = await prisma.product.findFirst({ where: { isActive: true, stockQty: { gte: 10 } } });
  if (!prod) {
    prod = await prisma.product.create({
      data: {
        sku: "TEST-PAD-SAMAND",
        name: "لنت ترمز چرخ جلو سمند عظام",
        brand: "سمند",
        category: "ترمز",
        partBrand: "عظام",
        price: 450_000,
        stockQty: 50,
      },
    });
  }
  testProductId = prod.id;

  // ایجاد یک سفارش تسویه‌شده تستی
  const order = await prisma.order.create({
    data: {
      number: `PF-TEST-${Date.now().toString().slice(-4)}`,
      customerId: testCustomerId,
      status: "PAID",
      subtotal: 900_000,
      total: 900_000,
      paidGateway: 900_000,
      publicToken: `tok-${Date.now()}`,
      items: {
        create: [
          {
            productId: testProductId,
            name: prod.name,
            sku: prod.sku,
            unit: "دست",
            qty: 2,
            unitPrice: 450_000,
            lineTotal: 900_000,
          },
        ],
      },
    },
  });
  testOrderId = order.id;
}

async function testLogisticsWorkflow() {
  console.log("== ۱. تست صدور حواله باربری استان کرمان ==");

  // صدور حواله توسط ادمین لجستیک
  const shipRes = await fetch(`${BASE}/api/admin/shipments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      orderId: testOrderId,
      carrierName: "باربری پیام شمس کرمان",
      carrierPhone: "034-32110001",
      destinationCity: "رفسنجان",
      freightPaymentType: "PAY_ON_DELIVERY",
      adminNote: "شامل ۱ کارتن لنت، انبار رفسنجان",
    }),
  });

  assert.equal(shipRes.status, 200, "صدور حواله باید ۲۰۰ برگرداند");
  const shipData = await shipRes.json();
  assert.equal(shipData.ok, true);
  testShipmentId = shipData.shipment.id;
  assert.equal(shipData.shipment.status, "PREPARING");
  console.log("  ✅ حواله ارسال با وضعیت PREPARING صادر شد.");

  // به‌روزرسانی حواله با شماره بیجک باربری و تغییر وضعیت به HANDED_TO_CARRIER
  const waybill = "BIJAK-98412-SHAMS";
  const patchRes = await fetch(`${BASE}/api/admin/shipments/${testShipmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "HANDED_TO_CARRIER",
      waybillNumber: waybill,
      adminNote: "تحویل راننده خط رفسنجان گردید.",
    }),
  });

  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.shipment.status, "HANDED_TO_CARRIER");
  assert.equal(patchData.shipment.waybillNumber, waybill);
  assert.ok(patchData.shipment.shippedAt, "تاریخ خروج باید ثبت شده باشد");
  console.log(`  ✅ شماره بیجک (${waybill}) ثبت و وضعیت به HANDED_TO_CARRIER ارتقا یافت.`);
}

async function testWarehousePickList() {
  console.log("== ۲. تست برگه جمع‌آوری تجمیعی انبار مرکزی (Pick List) ==");

  const pickRes = await fetch(`${BASE}/api/admin/warehouse/picklist`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(pickRes.status, 200);
  const pickData = await pickRes.json();
  assert.equal(pickData.ok, true);
  assert.ok(Array.isArray(pickData.pickList));
  console.log(`  ✅ تعداد اقلام تجمیعی انبار مرکزی: ${pickData.pickList.length} ردیف کالا.`);
}

async function testRmaAndRefundWorkflow() {
  console.log("== ۳. تست فرآیند ثبت مرجوعی و عودت وجه به کیف پول (RMA) ==");

  // مشتری قطعه‌ای را به عنوان معیوب ثبت می‌کند
  const rmaRes = await fetch(`${BASE}/api/rma`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({
      orderId: testOrderId,
      productId: testProductId,
      qty: 1,
      reason: "DEFECTIVE",
      customerNote: "یکی از لنت‌ها تابیدگی دارد و صدای سوت شدید ایجاد می‌کند.",
    }),
  });

  assert.equal(rmaRes.status, 200, "ثبت مرجوعی باید موفق باشد");
  const rmaData = await rmaRes.json();
  assert.equal(rmaData.ok, true);
  testRmaId = rmaData.rma.id;
  assert.ok(rmaData.rma.number.startsWith("RMA-"));
  console.log(`  ✅ درخواست مرجوعی با شماره ${rmaData.rma.number} ثبت گردید.`);

  // کارشناس فنی درخواست را APPROVED می‌کند
  const approveRes = await fetch(`${BASE}/api/admin/rma/${testRmaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "APPROVED",
      adminNote: "تأیید شد. لطفاً به انبار مرکزی کاردو کرمان ارسال فرمایید.",
    }),
  });
  assert.equal(approveRes.status, 200);

  // پس از دریافت و تست، واحد مالی تسویه نهایی (REFUNDED) را صادر می‌کند
  const refundAmount = 450_000;
  const refundRes = await fetch(`${BASE}/api/admin/rma/${testRmaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "REFUNDED",
      adminNote: "تست دستگاهی تایید شد. مبلغ ۴۵۰ هزار تومان به کیف پول عودت داده شد.",
      refundAmountOverride: refundAmount,
    }),
  });

  assert.equal(refundRes.status, 200);
  const refundData = await refundRes.json();
  assert.equal(refundData.status, "REFUNDED");

  // اعتبارسنجی ثبت تراکنش بستانکاری در کیف پول مشتری
  const walletTx = await prisma.walletTransaction.findFirst({
    where: { customerId: testCustomerId, refType: "RMA", refId: testRmaId },
  });
  assert.ok(walletTx, "تراکنش کیف پول باید ثبت شده باشد");
  assert.equal(Number(walletTx.amount), refundAmount, "مبلغ بستانکاری کیف پول باید ۴۵۰ هزار تومان باشد");
  assert.equal(walletTx.type, "REFUND");
  console.log(`  ✅ با تسویه RMA، کیف پول مشتری به مبلغ ${refundAmount.toLocaleString("fa-IR")} تومان شارژ شد.`);
}

async function cleanup() {
  console.log("== ۴. پاک‌سازی داده‌های تستی ==");
  if (testCustomerId) {
    if (testRmaId) await prisma.rmaRequest.deleteMany({ where: { id: testRmaId } });
    if (testShipmentId) await prisma.shipment.deleteMany({ where: { id: testShipmentId } });
    await prisma.walletTransaction.deleteMany({ where: { customerId: testCustomerId } });
    if (testOrderId) {
      await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } });
      await prisma.order.deleteMany({ where: { id: testOrderId } });
    }
    await prisma.otpCode.deleteMany({ where: { phone: "09349998877" } });
    await prisma.customer.deleteMany({ where: { id: testCustomerId } });
  }
  console.log("  ✅ داده‌های تست پاک‌سازی شدند.");
}

async function main() {
  try {
    await loginAdmin();
    await setupCustomerAndOrder();
    await testLogisticsWorkflow();
    await testWarehousePickList();
    await testRmaAndRefundWorkflow();
    console.log("\nنتایج آزمون: تمامی سناریوهای لجستیک، انبارداری و مرجوعی RMA با موفقیت پاس شدند! 🚚📦✨");
  } catch (err) {
    console.error("❌ خطا در اجرای تست:", err);
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
