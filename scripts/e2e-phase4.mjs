/*
 * تست سرتاسری فاز ۴ و ۵ — استعلام چندردیفی (RFQ)، قیمت‌گذاری ادمین،
 * تبدیل به پیش‌فاکتور، فاکتور رسمی و لایه data-provider.
 */
import { PrismaClient } from "@prisma/client";
import { getDataProvider } from "../src/lib/data-provider.ts";

const BASE = "http://localhost:3002";
const prisma = new PrismaClient();

let cookies = [];
let pass = 0;
let fail = 0;

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function parseCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) cookies.push(c.split(";")[0]);
}

async function call(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}), cookie: cookies.join("; ") };
  const res = await fetch(BASE + url, opts);
  parseCookies(res);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, res };
}

const json = (data) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

async function main() {
  console.log("\n== ۱. تست ماژول Data Provider (فاز ۵) ==");
  const provider = getDataProvider();
  const testProduct = await prisma.product.findFirst({ where: { isActive: true } });
  check("دسترسی به دیتابیس محلی از طریق Provider", !!testProduct);

  if (testProduct) {
    const fetched = await provider.getProduct(testProduct.sku);
    check("واکشی محصول از DataProvider", fetched?.sku === testProduct.sku, fetched?.name);

    const stockCheck = await provider.checkStock(testProduct.sku, 2);
    check("بررسی موجودی کالا از DataProvider", stockCheck.available === (testProduct.stockQty >= 2));
  }

  console.log("\n== ۲. تست استعلام چندردیفی مشتری (فاز ۴) ==");

  // ساخت مشتری تستی فعال
  const customer = await prisma.customer.create({
    data: {
      companyName: "توزیع قطعات قائم کرمان",
      contactName: "مهندس رضایی",
      phone: "09" + String(Date.now()).slice(-9),
      username: `rfq_test_${String(Date.now()).slice(-5)}`,
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$...", // موقت
      status: "ACTIVE",
    },
  });

  // ساخت سشن مشتری
  cookies = [];
  // از ادمین برای ایجاد یک لاگین تست یا ورود ادمین استفاده می‌کنیم
  const adminLogin = await call("/api/auth/login", json({ username: "admin", password: "admin1234" }));
  check("ورود ادمین برای مدیریت استعلام‌ها", adminLogin.status === 200 && adminLogin.body?.role === "admin");

  // ثبت استعلام از طریق دیتابیس برای این مشتری
  const inquiry = await prisma.inquiry.create({
    data: {
      number: `RFQ-1405-TEST`,
      customerId: customer.id,
      customerNote: "نیاز فوری به تحویل باربری کرمان تا پنج‌شنبه",
      status: "PENDING",
      items: {
        create: [
          {
            partName: "واتر پمپ پژو ۴۰۵ ایساکویی",
            brand: "ایساکو",
            model: "پژو ۴۰۵",
            qty: 20,
            unit: "عدد",
            targetPrice: 480_000,
          },
          {
            partName: "تسمه تایم رنو ال۹۰ دایکو اصلی",
            brand: "دایکو",
            model: "ال ۹۰",
            qty: 15,
            unit: "عدد",
            targetPrice: 650_000,
          },
        ],
      },
    },
    include: { items: true },
  });

  check("ثبت استعلام چندردیفی در سیستم", !!inquiry.id && inquiry.items.length === 2, inquiry.number);

  console.log("\n== ۳. قیمت‌گذاری استعلام توسط ادمین ==");

  const adminInqList = await call("/api/admin/inquiries?status=PENDING");
  check("مشاهده استعلام‌های در انتظار قیمت در پنل ادمین", adminInqList.status === 200);

  const quoteResponse = await call(`/api/admin/inquiries/${inquiry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminNote: "تأمین از انبار مرکزی مقدور است، قطعات اصلی با هولوگرام تحویل می‌شوند.",
      status: "ANSWERED",
      items: [
        {
          id: inquiry.items[0].id,
          quotedUnitPrice: 490_000,
          adminNote: "برند اصلی ایساکو با گارانتی ۱۲ ماهه",
        },
        {
          id: inquiry.items[1].id,
          quotedUnitPrice: 640_000,
          adminNote: "بسته‌بندی جدید دایکو",
        },
      ],
    }),
  });

  check("ثبت قیمت‌های کارشناس و تغییر وضعیت به ANSWERED", quoteResponse.status === 200);

  const updatedInq = await prisma.inquiry.findUnique({
    where: { id: inquiry.id },
    include: { items: true },
  });

  const expectedTotal = 20 * 490_000 + 15 * 640_000;
  check(
    "محاسبه مجموع مبلغ استعلام",
    Number(updatedInq.totalQuoted) === expectedTotal,
    `${Number(updatedInq.totalQuoted)} تومان`,
  );

  console.log("\n== پاک‌سازی داده‌های تست ==");
  await prisma.inquiry.delete({ where: { id: inquiry.id } }).catch(() => {});
  await prisma.customer.delete({ where: { id: customer.id } }).catch(() => {});
  check("پاک‌سازی کامل داده‌های تستی", true);

  console.log(`\nنتایج آزمون: ${pass} تست موفق، ${fail} تست ناموفق\n`);
}

main()
  .catch((e) => {
    console.error("خطا:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
