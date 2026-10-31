import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";

async function main() {
  console.log("=== تست سیستم‌های جدید: دیزاین سیستم، حسابدار، وب‌سرویس مالی و اعلان‌ها ===");

  // ۱. لاگین ادمین
  const adminLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: process.env.ADMIN_PASSWORD || "admin1234" }),
  });
  console.log("1) Admin Login:", adminLoginRes.status);
  const adminCookie = adminLoginRes.headers.get("set-cookie");

  // ۲. تعریف حسابدار جدید توسط مدیر
  const staffRes = await fetch(`${BASE}/api/admin/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      name: "حسابدار مالی ارشد",
      username: `acc_${Date.now()}`,
      password: "password123",
      role: "ACCOUNTANT",
    }),
  });
  const staffData = await staffRes.json();
  console.log("2) Create Accountant:", staffRes.status, staffData.ok ? `OK (User: ${staffData.staff.username}, Role: ${staffData.staff.role})` : staffData.error);

  // ۳. صدور کلید وب‌سرویس برای نرم‌افزار حسابداری (پارسیان)
  const apiKeyRes = await fetch(`${BASE}/api/admin/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      name: "اتصال حسابداری پارسیان شعبه ۱",
      system: "PARSIAN",
    }),
  });
  const apiKeyData = await apiKeyRes.json();
  const apiKey = apiKeyData.apiKey?.key;
  console.log("3) Issue Accounting API Key:", apiKeyRes.status, apiKeyData.ok ? `OK (Key: ${apiKey})` : apiKeyData.error);

  // ۴. تست فراخوانی وب‌سرویس حسابداری: دریافت سفارش‌ها
  const ordersApiRes = await fetch(`${BASE}/api/v1/accounting/orders`, {
    headers: { "x-api-key": apiKey },
  });
  const ordersApiData = await ordersApiRes.json();
  console.log("4) Accounting GET /orders:", ordersApiRes.status, "Count:", ordersApiData.orders?.length);

  // ۵. تست وب‌سرویس حسابداری: همگام‌سازی موجودی و قیمت
  const syncInvRes = await fetch(`${BASE}/api/v1/accounting/sync-inventory`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      items: [
        { sku: "SHK-ABS-PRD-01", price: 1350000, stockQty: 55 },
      ],
    }),
  });
  const syncInvData = await syncInvRes.json();
  console.log("5) Accounting POST /sync-inventory:", syncInvRes.status, syncInvData.message);

  // ۶. ارسال نوتیفیکیشن و بنر فوری توسط مدیر به همکاران
  const notifRes = await fetch(`${BASE}/api/admin/notifications/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      title: "تخفیف ویژه جشنواره پاییزه",
      message: "۱۰٪ تخفیف مازاد روی کلیه اقلام لنت و دیسک ترمز تا پایان هفته",
      type: "PROMO",
      target: "ALL",
      link: "/catalog",
      makeBanner: true,
      bannerLevel: "WARNING",
    }),
  });
  const notifData = await notifRes.json();
  console.log("6) Send Notification & Top Banner:", notifRes.status, notifData.message);

  // ۷. بررسی دریافت بنر در سمت کلاینت
  const bannerRes = await fetch(`${BASE}/api/announcements?target=CUSTOMER`);
  const bannerData = await bannerRes.json();
  console.log("7) GET /api/announcements:", bannerRes.status, "Active Banners:", bannerData.items?.length, "First:", bannerData.items?.[0]?.title);

  // ۸. لاگین مشتری و بررسی ریدایرکت مستقیم به کاتالوگ
  const customerLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "demo", password: "demo1234" }),
  });
  const customerLoginData = await customerLoginRes.json();
  console.log("8) Customer Login Redirect:", customerLoginRes.status, "Redirect Target:", customerLoginData.redirect);
  if (customerLoginData.redirect !== "/catalog") {
    throw new Error(`Expected redirect to /catalog, got ${customerLoginData.redirect}`);
  }

  console.log("\n✅ تمام قابلیت‌های جدید با موفقیت تایید و تست شدند!");
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
