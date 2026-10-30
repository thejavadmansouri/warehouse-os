/**
 * تست یکپارچه E2E برای سطوح همکاری (Tiers) و داشبورد هوش تجاری و گزارشات فروش (Analytics)
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";

let adminCookie = "";
let createdTierId = "";

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  assert.equal(res.status, 200, "ورود ادمین باید موفق باشد");
  adminCookie = res.headers.get("set-cookie")?.split(";")[0] || "";
}

async function testTiersManagement() {
  console.log("== ۱. تست مدیریت سطوح همکاری و تخفیف‌های B2B ==");

  // دریافت لیست سطوح
  const listRes = await fetch(`${BASE}/api/admin/tiers`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.ok, true);
  assert.ok(listData.tiers.length >= 3, "حداقل ۳ سطح پایه باید وجود داشته باشد");
  console.log(`  ✅ تعداد سطوح تعریف‌شده فعلی: ${listData.tiers.length} سطح.`);

  // ساخت سطح جدید ویژه تعمیرگاه‌ها
  const createRes = await fetch(`${BASE}/api/admin/tiers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: `تعمیرگاه‌های منتخب-${Date.now().toString().slice(-4)}`,
      creditLimit: 30_000_000,
      baseDiscount: 8,
      sortOrder: 4,
    }),
  });
  assert.equal(createRes.status, 200);
  const createData = await createRes.json();
  assert.equal(createData.ok, true);
  createdTierId = createData.tier.id;
  assert.equal(createData.tier.baseDiscount, 8);
  console.log(`  ✅ سطح همکاری جدید (${createData.tier.name}) با ۸٪ تخفیف پایه ایجاد گردید.`);

  // ویرایش سطح
  const patchRes = await fetch(`${BASE}/api/admin/tiers/${createdTierId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      baseDiscount: 10,
    }),
  });
  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.tier.baseDiscount, 10);
  console.log("  ✅ ویرایش درصد تخفیف به ۱۰٪ با موفقیت تأیید شد.");
}

async function testAnalyticsDashboard() {
  console.log("== ۲. تست داشبورد هوش تجاری و گزارشات فروش استان کرمان ==");

  const res = await fetch(`${BASE}/api/admin/analytics`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);

  // بررسی وجود ساختار کامل داده‌های هوش تجاری
  assert.ok(data.kpis, "شاخص‌های کلیدی عملکرد باید وجود داشته باشند");
  assert.ok(typeof data.kpis.totalRevenue === "number");
  assert.ok(typeof data.kpis.avgOrderValue === "number");
  assert.ok(Array.isArray(data.citySales), "توزیع جغرافیایی شهرهای کرمان باید آرایه باشد");
  assert.ok(Array.isArray(data.topProducts), "پرفروش‌ترین قطعات باید آرایه باشد");
  assert.ok(data.creditAndCheques, "داده‌های ریسک اعتباری و چک‌ها باید وجود داشته باشد");

  console.log(`  ✅ کل فروش ثبت‌شده: ${data.kpis.totalRevenue.toLocaleString("fa-IR")} تومان.`);
  console.log(`  ✅ تعداد شهرهای با رکورد فروش در استان: ${data.citySales.length} شهرستان.`);
  console.log(`  ✅ مبالغ چک‌های صیاد معتبر در جریان: ${data.creditAndCheques.registeredSayadAmount.toLocaleString("fa-IR")} تومان.`);
}

async function cleanup() {
  console.log("== ۳. پاک‌سازی داده‌های تستی ==");
  if (createdTierId) {
    await prisma.tier.deleteMany({ where: { id: createdTierId } });
  }
  console.log("  ✅ داده‌های تست پاک‌سازی شدند.");
}

async function main() {
  try {
    await loginAdmin();
    await testTiersManagement();
    await testAnalyticsDashboard();
    console.log("\nنتایج آزمون: کلیه سناریوهای سطوح همکاری و گزارشات داشبورد با موفقیت تأیید شدند! 📊📈✨");
  } catch (err) {
    console.error("❌ خطا در اجرای تست:", err);
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
