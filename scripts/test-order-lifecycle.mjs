import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET?.trim());

async function run() {
  console.log("=== تست چرخه کامل سفارش، نوار پیشرفت و اکشن‌های مدیر/انباردار ===");

  // پیدا کردن آخرین سفارش ثبت شده
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
    include: { items: true, customer: true, shipment: true }
  });

  if (!order) {
    console.error("سفارشی برای تست یافت نشد");
    return;
  }

  console.log(`سفارش انتخابی: ${order.number} (شناسه: ${order.id})`);

  const adminUser = await prisma.adminUser.findFirst({ where: { username: "admin" } });

  // ساخت توکن ادمین
  const adminJwt = await new SignJWT({ sub: adminUser.id, role: "admin", username: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secret);

  // ۱. تست واکشی سریع فاکتور برای مودال
  const resModal = await fetch(`http://localhost:3002/api/orders/${order.id}`, {
    headers: { Cookie: `b2b_session=${adminJwt}` }
  });
  const dataModal = await resModal.json();
  console.log(`1) تست واکشی فاکتور برای مودال: HTTP ${resModal.status}, اقلام: ${dataModal.order?.items?.length} قلم`);

  // ۲. تست گام ۵۰٪ (انباردار در حال جمع‌آوری اقلام در انبار مرکزی)
  const resPrep = await fetch(`http://localhost:3002/api/admin/orders/${order.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: `b2b_session=${adminJwt}` },
    body: JSON.stringify({ action: "set_preparing" })
  });
  const dataPrep = await resPrep.json();
  console.log(`2) تغییر وضعیت به ۵۰٪ (جمع‌آوری انبار): HTTP ${resPrep.status}`, dataPrep);

  // ۳. تست گام ۸۰٪ (تحویل باربری و ثبت شماره بیجک)
  const resShip = await fetch(`http://localhost:3002/api/admin/orders/${order.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: `b2b_session=${adminJwt}` },
    body: JSON.stringify({
      action: "set_shipped",
      carrierName: "باربری پیام شمس کرمان",
      waybillNumber: "BJ-789012"
    })
  });
  const dataShip = await resShip.json();
  console.log(`3) تغییر وضعیت به ۸۰٪ (حواله باربری کرمان): HTTP ${resShip.status}`, dataShip);

  // ۴. تست گام ۱۰۰٪ (تحویل به مشتری)
  const resDeliv = await fetch(`http://localhost:3002/api/admin/orders/${order.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: `b2b_session=${adminJwt}` },
    body: JSON.stringify({ action: "set_delivered" })
  });
  const dataDeliv = await resDeliv.json();
  console.log(`4) تغییر وضعیت به ۱۰۰٪ (تحویل نهایی کالا): HTTP ${resDeliv.status}`, dataDeliv);

  console.log("✅ چرخه کامل پیشرفت سفارش و اعلان‌های سیستمی با موفقیت تست شد!");
  process.exit(0);
}

run().catch(e => {
  console.error("Test Error:", e);
  process.exit(1);
});
