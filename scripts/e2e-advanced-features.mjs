import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3002";

async function run() {
  console.log("=== آزمون جامع امکانات پیشرفته B2B کاردو (اکسل سفارش، پیامک، صورت‌حساب، PWA و تبلت انباردار) ===");

  // ۱. ایجاد یا دریافت مشتری و ادمین تست
  const testPhone = "09139999901";
  let customer = await prisma.customer.findUnique({ where: { phone: testPhone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        companyName: "فروشگاه یدک برادران رفسنجانی",
        contactName: "حاج محمد رفسنجانی",
        phone: testPhone,
        address: "رفسنجان، خیابان امیرکبیر، نبش کوچه ۱۲",
        status: "ACTIVE",
        discountPercent: 5,
      },
    });
  }

  // ۲. ورود ادمین و دریافت کوکی
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  const adminCookie = adminRes.headers.get("set-cookie")?.split(";")[0] || "";

  // ورود مشتری
  const otpReq = await fetch(`${BASE_URL}/api/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: testPhone }),
  });
  const otpData = await otpReq.json();

  const otpVerify = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: testPhone, code: otpData.devCode }),
  });
  const customerCookie = otpVerify.headers.get("set-cookie")?.split(";")[0] || "";

  // ==========================================
  // تست اول: سفارش سریع متنی و اکسل (Bulk Order)
  // ==========================================
  console.log("\n== ۱. تست استعلام و اعتبارسنجی سفارش سریع دسته‌جمعی (Bulk Order) ==");
  const products = await prisma.product.findMany({ take: 3 });
  if (products.length < 2) {
    throw new Error("تعداد کافی محصول در دیتابیس موجود نیست");
  }

  const p1 = products[0];
  const p2 = products[1];

  const bulkText = `${p1.sku} 15\n${p2.sku}, 10\nFAKE-SKU-999 5`;
  const validateRes = await fetch(`${BASE_URL}/api/orders/bulk-validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: customerCookie,
    },
    body: JSON.stringify({ text: bulkText }),
  });

  const validateData = await validateRes.json();
  if (!validateData.ok) {
    throw new Error(`خطا در اعتبارسنجی متنی: ${JSON.stringify(validateData)}`);
  }

  console.log(`  ✅ تعداد اقلام شناسایی‌شده: ${validateData.stats.matchedCount} قلم.`);
  console.log(`  ✅ تعداد کدهای نامعتبر مسدودشده: ${validateData.stats.unrecognizedCount} مورد.`);
  console.log(`  ✅ جمع مبلغ تخمینی سفارش: ${validateData.stats.totalEstimatedAmount.toLocaleString("fa-IR")} تومان.`);

  // ثبت نهایی سفارش دسته‌جمعی
  const shipping = await prisma.shippingMethod.findFirst({ where: { isActive: true } });
  const bulkSubmitRes = await fetch(`${BASE_URL}/api/orders/bulk-submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: customerCookie,
    },
    body: JSON.stringify({
      items: [
        { productId: p1.id, qty: 2 },
        { productId: p2.id, qty: 2 },
      ],
      shippingId: shipping.id,
      note: "ارسال سریع با باربری پیام شمس کرمان",
    }),
  });

  const bulkSubmitData = await bulkSubmitRes.json();
  if (!bulkSubmitData.ok) {
    throw new Error(`خطا در ثبت سفارش دسته‌جمعی: ${JSON.stringify(bulkSubmitData)}`);
  }
  const createdOrderId = bulkSubmitData.order.id;
  console.log(`  ✅ سفارش دسته‌جمعی با شماره ${bulkSubmitData.order.number} و مبلغ ${bulkSubmitData.order.total.toLocaleString("fa-IR")} تومان صادر گردید.`);

  // ==========================================
  // تست دوم: سیستم هوشمند اعلان‌ها و پیامک‌ها
  // ==========================================
  console.log("\n== ۲. تست مرکز اعلان‌های درون‌برنامه‌ای و پیامک‌ها ==");
  const notifRes = await fetch(`${BASE_URL}/api/notifications`, {
    headers: { Cookie: customerCookie },
  });
  const notifData = await notifRes.json();
  if (!notifData.ok) throw new Error("خطا در دریافت لیست اعلان‌ها");

  console.log(`  ✅ تعداد اعلان‌های ثبت‌شده: ${notifData.notifications.length} مورد.`);
  console.log(`  ✅ تعداد پیام‌های خوانده‌نشده: ${notifData.unreadCount} مورد.`);

  // تست خوانده شدن اعلان
  const patchRes = await fetch(`${BASE_URL}/api/notifications`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({}),
  });
  const patchData = await patchRes.json();
  if (!patchData.ok) throw new Error("خطا در خوانده شدن اعلان‌ها");
  console.log("  ✅ وضعیت تمام اعلان‌ها با موفقیت به خوانده‌شده تغییر یافت.");

  // ==========================================
  // تست سوم: صورت‌حساب رسمی معین و گردش مالی
  // ==========================================
  console.log("\n== ۳. تست صدور صورت‌حساب معین دوره‌ای حسابداری ==");
  const statementRes = await fetch(`${BASE_URL}/api/accounting/statement?period=90`, {
    headers: { Cookie: customerCookie },
  });
  const statementData = await statementRes.json();
  if (!statementData.ok) throw new Error("خطا در محاسبه معین حساب");

  console.log(`  ✅ مشخصات حقوقی صادرکننده: ${statementData.companyInfo.name}`);
  console.log(`  ✅ جمع بدهکار (فاکتورها): ${statementData.summary.totalDebit.toLocaleString("fa-IR")} تومان.`);
  console.log(`  ✅ تعداد ردیف‌های گردش حساب: ${statementData.rows.length} ردیف سند.`);

  // ==========================================
  // تست چهارم: تبلت انباردار و بارکدخوان (Picker Mode)
  // ==========================================
  console.log("\n== ۴. تست پنل تبلت و بارکدخوان انبار (Picker Mode) ==");
  // به‌روزرسانی وضعیت سفارش به PAID و ایجاد حواله ارسال جهت نمایش در صف تبلت
  await prisma.order.update({
    where: { id: createdOrderId },
    data: { status: "PAID" },
  });

  const shipment = await prisma.shipment.create({
    data: {
      orderId: createdOrderId,
      carrierName: "باربری پیام شمس کرمان",
      destinationCity: "رفسنجان",
      status: "PREPARING",
    },
  });

  const pickerRes = await fetch(`${BASE_URL}/api/admin/picker`, {
    headers: { Cookie: adminCookie },
  });
  const pickerData = await pickerRes.json();
  if (!pickerData.ok) {
    console.error("picker error:", pickerRes.status, pickerData);
    throw new Error("خطا در دریافت صف تبلت انباردار");
  }

  console.log(`  ✅ انبار فعال: ${pickerData.warehouseName}`);
  console.log(`  ✅ تعداد سفارش‌های صف جمع‌آوری: ${pickerData.pickLists.length} سفارش.`);

  // تست تأیید جمع‌آوری و صدور بیجک
  const completeRes = await fetch(`${BASE_URL}/api/admin/picker/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      orderId: createdOrderId,
      waybillNumber: "BIJAK-SHAMS-998811",
    }),
  });
  const completeData = await completeRes.json();
  if (!completeData.ok) throw new Error("خطا در تکمیل جمع‌آوری توسط انباردار");

  console.log(`  ✅ بسته سفارش تأیید گردید و بیجک باربری صادر شد: ${completeData.waybillNumber}`);

  // ==========================================
  // تست پنجم: بررسی فایل‌های PWA و Manifest
  // ==========================================
  console.log("\n== ۵. تست فایل‌های PWA (Manifest و Service Worker) ==");
  const manifestRes = await fetch(`${BASE_URL}/manifest.json`);
  if (!manifestRes.ok) throw new Error("فایل manifest.json در دسترس نیست");
  const manifestJson = await manifestRes.json();
  console.log(`  ✅ فایل Manifest تأیید شد: ${manifestJson.short_name} (${manifestJson.display})`);

  const swRes = await fetch(`${BASE_URL}/sw.js`);
  if (!swRes.ok) throw new Error("فایل sw.js در دسترس نیست");
  console.log("  ✅ فایل Service Worker (sw.js) با موفقیت در روت برنامه بارگذاری گردید.");

  // پاک‌سازی سفارش تستی
  console.log("\n== ۶. پاک‌سازی داده‌های آزمون ==");
  await prisma.notification.deleteMany({ where: { customerId: customer.id } });
  await prisma.shipment.deleteMany({ where: { orderId: createdOrderId } });
  await prisma.orderItem.deleteMany({ where: { orderId: createdOrderId } });
  await prisma.order.delete({ where: { id: createdOrderId } });
  console.log("  ✅ داده‌های آزمون با موفقیت پاک‌سازی شدند.");

  console.log("\n🎯 تمامی تست‌های ۵ گانه با موفقیت ۱۰۰٪ پاس شدند! سیستم کاملاً عملیاتی است.");
}

run()
  .catch((e) => {
    console.error("❌ خطا در اجرای تست:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
