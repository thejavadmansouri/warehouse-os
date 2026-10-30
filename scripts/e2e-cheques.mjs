import { PrismaClient } from "@prisma/client";
import assert from "node:assert";

const prisma = new PrismaClient();
const BASE = process.env.TEST_BASE_URL || "http://localhost:3002";

let adminCookie = "";
let customerCookie = "";
let testCustomerId = "";

const phone = "0999" + String(Date.now()).slice(-7);
const testSayadId = "1234567890123456";

async function setup() {
  console.log("== ۱. راه‌اندازی و ورود ادمین و مشتری ==");
  // ۱. ورود ادمین
  const adminRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  assert.equal(adminRes.status, 200, "ورود ادمین باید موفق باشد");
  adminCookie = adminRes.headers.get("set-cookie") || "";

  // ۲. ایجاد مشتری تستی
  const tier = await prisma.tier.findFirst();
  const customer = await prisma.customer.create({
    data: {
      companyName: "فروشگاه تست چک کرمان",
      contactName: "مدیر تستی چک",
      phone,
      status: "ACTIVE",
      tierId: tier?.id,
      creditLimitOverride: 5_000_000,
    },
  });
  testCustomerId = customer.id;

  // ۳. ارسال OTP و لاگین مشتری
  const otpRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const otpData = await otpRes.json();
  assert(otpData.devCode, "کد OTP تستی باید تولید شود");

  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: otpData.devCode }),
  });
  assert.equal(verifyRes.status, 200, "تایید OTP باید موفق باشد");
  customerCookie = verifyRes.headers.get("set-cookie") || "";

  console.log("  ✅ ورود ادمین و مشتری با سقف اعتبار اولیه ۵ میلیون تومان انجام شد.");
}

async function testCustomerChequeRegistration() {
  console.log("== ۲. تست ثبت چک صیادی توسط مشتری ==");

  // الف. اعتبارسنجی رد شدن شناسه صیاد کمتر از ۱۶ رقم
  const invalidRes = await fetch(`${BASE}/api/cheques`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({
      sayadId: "12345", // نامعتبر
      chequeNumber: "1234/56",
      bankName: "بانک ملی ایران",
      drawerName: "علی کرمانی",
      amount: 15_000_000,
      issueDate: "2026-10-30",
      dueDate: "2026-11-30",
    }),
  });
  assert.equal(invalidRes.status, 400, "شناسه ۵ رقمی صیاد باید رد شود");
  console.log("  ✅ شناسه صیاد نامعتبر با موفقیت اعتبارسنجی و رد شد.");

  // ب. ثبت موفق چک معتبر ۱۶ رقمی
  const validRes = await fetch(`${BASE}/api/cheques`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({
      sayadId: testSayadId,
      chequeNumber: "789123/01",
      bankName: "بانک ملت",
      drawerName: "حاج رضا کرمانی",
      drawerNationalId: "2990000000",
      amount: 15_000_000, // ۱۵ میلیون تومان
      issueDate: "2026-10-30",
      dueDate: "2026-11-30",
    }),
  });
  assert.equal(validRes.status, 200, "ثبت چک معتبر باید موفق باشد");
  const data = await validRes.json();
  assert.equal(data.cheque.status, "RECEIVED", "وضعیت اولیه چک باید RECEIVED باشد");
  console.log("  ✅ چک صیادی ۱۵ میلیون تومانی با وضعیت RECEIVED ثبت گردید.");

  // ج. تست جلوگیری از ثبت تکراری شناسه صیاد
  const duplicateRes = await fetch(`${BASE}/api/cheques`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({
      sayadId: testSayadId,
      chequeNumber: "999999",
      bankName: "بانک صادرات ایران",
      drawerName: "نام دیگر",
      amount: 10_000_000,
      issueDate: "2026-10-30",
      dueDate: "2026-11-30",
    }),
  });
  assert.equal(duplicateRes.status, 400, "شناسه صیاد تکراری باید ریجکت شود");
  console.log("  ✅ ثبت چک تکراری با شناسه صیاد یکسان با موفقیت مسدود شد.");
}

async function testAdminApprovalAndCreditExpansion() {
  console.log("== ۳. تست تأیید صیاد توسط واحد مالی و شارژ خط اعتبار مشتری ==");

  // دریافت چک از لیست ادمین
  const listRes = await fetch(`${BASE}/api/admin/cheques?status=RECEIVED`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  const target = listData.cheques.find((c) => c.sayadId === testSayadId);
  assert(target, "چک ثبت‌شده باید در لیست ادمین موجود باشد");

  // تأیید صیاد و درخواست افزایش سقف اعتبار
  const patchRes = await fetch(`${BASE}/api/admin/cheques/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "REGISTERED_SAYAD",
      sayadVerified: true,
      expandCredit: true,
      adminNote: "استعلام صیاد بانک مرکزی مثبت و سفید بود. اعتبار ۱۵ میلیون تومان افزوده شد.",
    }),
  });
  assert.equal(patchRes.status, 200, "تأیید چک باید موفق باشد");

  // بررسی افزایش سقف اعتبار مشتری در پایگاه داده: ۵ میلیون اولیه + ۱۵ میلیون چک = ۲۰ میلیون تومان
  const updatedCust = await prisma.customer.findUnique({
    where: { id: testCustomerId },
  });
  assert.equal(Number(updatedCust.creditLimitOverride), 20_000_000, "سقف اعتبار مشتری باید به ۲۰ میلیون تومان افزایش یافته باشد");
  console.log("  ✅ سقف اعتبار مشتری از ۵ به ۲۰ میلیون تومان بر مبنای چک صیاد افزایش یافت.");
}

async function testBouncedChequeSuspension() {
  console.log("== ۴. تست برگشت چک (نکول) و تعلیق ریسک مشتری ==");

  const target = await prisma.cheque.findFirst({
    where: { sayadId: testSayadId },
  });

  const bounceRes = await fetch(`${BASE}/api/admin/cheques/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      status: "BOUNCED",
      adminNote: "چک در تاریخ سررسید برگشت خورد؛ حساب معلق گردید.",
    }),
  });
  assert.equal(bounceRes.status, 200);

  const suspendedCust = await prisma.customer.findUnique({
    where: { id: testCustomerId },
  });
  assert.equal(suspendedCust.status, "BLOCKED", "مشتری با چک برگشتی باید بلافاصله BLOCKED شود");
  console.log("  ✅ با نکول چک، وضعیت حساب مشتری بلافاصله به BLOCKED تغییر یافت.");
}

async function cleanup() {
  console.log("== ۵. پاک‌سازی داده‌های تستی ==");
  if (testCustomerId) {
    await prisma.cheque.deleteMany({ where: { customerId: testCustomerId } });
    await prisma.customer.deleteMany({ where: { id: testCustomerId } });
  }
  console.log("  ✅ داده‌های تست پاک‌سازی شدند.");
  await prisma.$disconnect();
}

async function main() {
  try {
    await setup();
    await testCustomerChequeRegistration();
    await testAdminApprovalAndCreditExpansion();
    await testBouncedChequeSuspension();
    await cleanup();
    console.log("\nنتایج آزمون: کلیه تست‌های سیستم مدیریت چک‌های صیادی و خط اعتبار با موفقیت پاس شدند! 🎯");
    process.exit(0);
  } catch (err) {
    console.error("❌ خطا در اجرای تست:", err);
    await cleanup();
    process.exit(1);
  }
}

main();
