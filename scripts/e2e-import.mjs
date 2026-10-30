import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import assert from "node:assert";

const prisma = new PrismaClient();
const BASE = process.env.TEST_BASE_URL || "http://localhost:3002";

let cookie = "";

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  assert.equal(res.status, 200, "ورود ادمین باید موفق باشد");
  cookie = res.headers.get("set-cookie") || "";
}

async function testTemplateDownload() {
  console.log("== ۱. تست دانلود فایل اکسل نمونه استاندارد ==");
  const res = await fetch(`${BASE}/api/admin/import/template`, {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200, "دانلود فایل باید موفق باشد");
  const buffer = await res.arrayBuffer();
  assert(buffer.byteLength > 1000, "اندازه فایل اکسل باید معتبر باشد");

  const wb = XLSX.read(Buffer.from(buffer), { type: "buffer" });
  assert(wb.SheetNames.length > 0, "فایل باید شیت داشته باشد");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  assert(rows.length >= 3, "فایل باید حداقل ۳ ردیف نمونه داشته باشد");
  console.log(`  ✅ فایل اکسل با ${rows.length} ردیف استاندارد با موفقیت جنریت شد.`);
}

async function testFullImport() {
  console.log("== ۲. تست ورود گروهی کامل کاتالوگ (Full Import) ==");
  
  // تولید یک فایل اکسل تستی در حافظه با اقلام جدید و یک ردیف دارای خطای عمدی
  const testItems = [
    {
      "کد فنی": "TEST-IMP-001",
      "نام قطعه": "دیسک ترمز چرخ جلو رانا و ۲۰۶ تیپ ۵",
      "برند خودرو": "پژو",
      "مدل خودرو": "۲۰۶",
      "قسمت خودرو": "سیستم ترمز",
      "برند سازنده": "عظام",
      "کد OEM": "OEM-RN-4246",
      "بارکد": "626000000001",
      "قیمت (تومان)": 850000,
      "موجودی انبار": 80,
      "تعداد در بسته": 2,
      "واحد سنجش": "دست",
    },
    {
      "کد فنی": "TEST-IMP-002",
      "نام قطعه": "واتر پمپ سمند موتور ملی EF7",
      "برند خودرو": "سمند",
      "مدل خودرو": "EF7",
      "قسمت خودرو": "سیستم خنک‌کننده",
      "برند سازنده": "ایساکو",
      "کد OEM": "OEM-SM-WP01",
      "بارکد": "626000000002",
      "قیمت (تومان)": 620000,
      "موجودی انبار": 110,
      "تعداد در بسته": 1,
      "واحد سنجش": "عدد",
    },
    {
      "کد فنی": "", // خطای عمدی: بدون کد فنی
      "نام قطعه": "تسمه دینام بدون کد",
      "قیمت (تومان)": 150000,
      "موجودی انبار": 10,
    }
  ];

  const ws = XLSX.utils.json_to_sheet(testItems);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "import_test");
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const formData = new FormData();
  formData.append("file", new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "test_catalog.xlsx");
  formData.append("mode", "full");

  const res = await fetch(`${BASE}/api/admin/import`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: formData,
  });

  assert.equal(res.status, 200, "پاسخ API ایمپورت باید 200 باشد");
  const data = await res.json();
  assert(data.ok, "فیلد ok باید true باشد");
  assert.equal(data.summary.totalRows, 3, "تعداد کل ردیف‌ها باید ۳ باشد");
  assert.equal(data.summary.createdCount, 2, "باید ۲ کالا با موفقیت اضافه شوند");
  assert.equal(data.summary.failedCount, 1, "ردیف بدون کد فنی باید ریجکت شود");

  // بررسی ذخیره‌سازی در پایگاه داده
  const p1 = await prisma.product.findUnique({ where: { sku: "TEST-IMP-001" } });
  assert(p1, "کالای اول باید در دیتابیس وجود داشته باشد");
  assert.equal(Number(p1.price), 850000, "قیمت کالای اول باید ۸۵۰ هزار تومان باشد");
  assert.equal(p1.stockQty, 80, "موجودی انبار باید ۸۰ باشد");
  assert.equal(p1.partBrand, "عظام", "پارت‌برند باید عظام باشد");

  console.log("  ✅ ورود گروهی ۲ محصول و تشخیص صحیح خطای ردیف نامعتبر انجام شد.");
}

async function testPriceStockUpdateMode() {
  console.log("== ۳. تست به‌روزرسانی سریع قیمت و موجودی (Price & Stock Only) ==");

  // به‌روزرسانی قیمت و موجودی TEST-IMP-001
  const updateItems = [
    {
      "کد فنی": "TEST-IMP-001",
      "قیمت (تومان)": 920000, // افزایش قیمت
      "موجودی انبار": 150,    // افزایش موجودی
    },
    {
      "کد فنی": "NON-EXISTENT-SKU", // کدی که وجود ندارد
      "قیمت (تومان)": 100000,
      "موجودی انبار": 20,
    }
  ];

  const ws = XLSX.utils.json_to_sheet(updateItems);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "price_update");
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const formData = new FormData();
  formData.append("file", new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "price_update.xlsx");
  formData.append("mode", "price_stock_only");

  const res = await fetch(`${BASE}/api/admin/import`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: formData,
  });

  assert.equal(res.status, 200, "پاسخ به‌روزرسانی باید 200 باشد");
  const data = await res.json();
  assert.equal(data.summary.updatedCount, 1, "یک محصول باید به‌روزرسانی شود");
  assert.equal(data.summary.failedCount, 1, "کد ناموجود باید به عنوان خطا ثبت شود");

  const p1 = await prisma.product.findUnique({ where: { sku: "TEST-IMP-001" } });
  assert.equal(Number(p1.price), 920000, "قیمت جدید باید ۹۲۰ هزار تومان باشد");
  assert.equal(p1.stockQty, 150, "موجودی جدید باید ۱۵۰ باشد");

  console.log("  ✅ به‌روزرسانی سریع نرخ و موجودی با حفظ اطلاعات قبلی کالا تأیید شد.");
}

async function cleanup() {
  console.log("== ۴. پاک‌سازی داده‌های تستی ==");
  await prisma.product.deleteMany({
    where: { sku: { startsWith: "TEST-IMP-" } },
  });
  console.log("  ✅ داده‌های تست پاک‌سازی شدند.");
  await prisma.$disconnect();
}

async function main() {
  try {
    await loginAdmin();
    await testTemplateDownload();
    await testFullImport();
    await testPriceStockUpdateMode();
    await cleanup();
    console.log("\nنتایج آزمون: کلیه تست‌های مرکز ورود گروهی اکسل با موفقیت پاس شدند! 🎯");
    process.exit(0);
  } catch (err) {
    console.error("❌ خطا در اجرای تست:", err);
    await cleanup();
    process.exit(1);
  }
}

main();
