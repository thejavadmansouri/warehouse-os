/*
 * Seed فاز ۱ — ساخت ادمین اولیه و طبقه‌های پایه.
 * اجرا: npm run db:seed
 *
 * ⚠️ ادمین با رمز پیش‌فرض ساخته می‌شود — بلافاصله بعد از اولین ورود عوضش کنید
 *    (رمز را با متغیر ADMIN_PASSWORD می‌توان موقع اجرا عوض کرد).
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  // --- ادمین ---
  const username = "admin";
  const password = process.env.ADMIN_PASSWORD || "admin1234";

  const existingAdmin = await prisma.adminUser.findUnique({ where: { username } });

  if (existingAdmin) {
    console.log(`ادمین «${username}» از قبل موجود بود — تغییری نکرد.`);
  } else {
    await prisma.adminUser.create({
      data: {
        username,
        passwordHash: await argon2.hash(password),
        name: "مدیر فروشگاه",
      },
    });

    console.log("\n✅ ادمین ساخته شد:");
    console.log(`   نام کاربری: ${username}`);
    console.log(`   رمز عبور:   ${password}`);
    console.log("   ⚠️  این رمز پیش‌فرض است — بلافاصله عوضش کنید.");
  }

  // --- طبقه‌های پایه ---
  const tiers = [
    { name: "طلایی", creditLimit: 200_000_000, baseDiscount: 12, sortOrder: 1 },
    { name: "نقره‌ای", creditLimit: 50_000_000, baseDiscount: 6, sortOrder: 2 },
    { name: "برنزی", creditLimit: 10_000_000, baseDiscount: 3, sortOrder: 3 },
  ];

  for (const t of tiers) {
    await prisma.tier.upsert({
      where: { name: t.name },
      update: {}, // مقدارهای موجود دست‌نخورده بمانند
      create: t,
    });

    console.log(`طبقه «${t.name}» آماده است.`);
  }

  // --- روش‌های ارسال ---
  const shipping = [
    {
      code: "PICKUP",
      name: "تحویل حضوری — فروشگاه کرمان",
      cost: 0,
      freeAbove: null,
      note: "آماده‌سازی ۲ ساعته، شنبه تا پنجشنبه ۸ تا ۱۷",
      sortOrder: 1,
    },
    {
      code: "KERMAN_COURIER",
      name: "پیک شهری کرمان",
      cost: 80_000,
      freeAbove: 3_000_000,
      note: "تحویل همان روز برای سفارش‌های قبل از ۱۴",
      sortOrder: 2,
    },
    {
      code: "FREIGHT",
      name: "باربری بین‌شهری",
      cost: 0,
      freeAbove: null,
      note: "کرایه پس‌کرایه — با باربری مورد نظر شما",
      sortOrder: 3,
    },
  ];

  for (const s of shipping) {
    await prisma.shippingMethod.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });

    console.log(`روش ارسال «${s.name}» آماده است.`);
  }

  // --- قطعات نمونه ---
  // قیمت‌ها نمونه‌اند (تومان) — ادمین از پنل عوضشان می‌کند.
  const products = [
    {
      sku: "BRK-PRD-F-01",
      oemCode: "21110-3701100",
      name: "لنت ترمز جلو پراید — جین ۴ عددی",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "ترمز",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 1_480_000,
      stockQty: 120,
      volumePrices: [
        { qtyFrom: 5, discountPercent: 4 },
        { qtyFrom: 20, discountPercent: 8 },
        { qtyFrom: 50, discountPercent: 12 },
      ],
    },
    {
      sku: "BRK-PRD-R-01",
      oemCode: "21120-3701100",
      name: "لنت ترمز عقب پراید — جین ۴ عددی",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "ترمز",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 1_260_000,
      stockQty: 84,
      volumePrices: [
        { qtyFrom: 5, discountPercent: 4 },
        { qtyFrom: 20, discountPercent: 8 },
      ],
    },
    {
      sku: "BRK-206-F-01",
      oemCode: "4253-38",
      name: "لنت ترمز جلو ۲۰۶ تیپ ۲",
      brand: "پژو ۲۰۶",
      model: "تیپ ۲ / ۵",
      category: "ترمز",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 2_150_000,
      stockQty: 60,
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 9 },
      ],
    },
    {
      sku: "BRK-DSC-PRD-01",
      oemCode: "21100-3701500",
      name: "دیسک ترمز جلو پراید",
      brand: "پراید",
      model: "۱۳۱",
      category: "ترمز",
      unit: "عدد",
      packSize: 2,
      minQty: 2,
      price: 3_450_000,
      stockQty: 40,
      volumePrices: [
        { qtyFrom: 10, discountPercent: 6 },
        { qtyFrom: 30, discountPercent: 10 },
      ],
    },
    {
      sku: "FLT-OIL-PRD-01",
      oemCode: "26300-35503",
      name: "فیلتر روغن پراید / ۲۰۶",
      brand: "پراید",
      model: "همه مدل‌ها",
      category: "فیلتر",
      unit: "عدد",
      packSize: 10,
      minQty: 10,
      price: 185_000,
      stockQty: 500,
      volumePrices: [
        { qtyFrom: 50, discountPercent: 5 },
        { qtyFrom: 200, discountPercent: 10 },
      ],
    },
    {
      sku: "FLT-AIR-PRD-01",
      oemCode: "28113-02500",
      name: "فیلتر هوا پراید",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "فیلتر",
      unit: "عدد",
      packSize: 5,
      minQty: 5,
      price: 245_000,
      stockQty: 300,
      volumePrices: [
        { qtyFrom: 25, discountPercent: 5 },
        { qtyFrom: 100, discountPercent: 9 },
      ],
    },
    {
      sku: "SPK-PRD-01",
      oemCode: "BKR6E-11",
      name: "شمع موتور پراید (NGK)",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "موتور",
      unit: "عدد",
      packSize: 4,
      minQty: 4,
      price: 320_000,
      stockQty: 240,
      volumePrices: [
        { qtyFrom: 20, discountPercent: 5 },
        { qtyFrom: 80, discountPercent: 10 },
      ],
    },
    {
      sku: "GSK-HD-SMD-01",
      oemCode: "21211-3701100",
      name: "واشر سرسیلندر سمند EF7",
      brand: "سمند",
      model: "EF7",
      category: "موتور",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 890_000,
      stockQty: 35,
      volumePrices: [{ qtyFrom: 5, discountPercent: 6 }],
    },
    {
      sku: "BLT-TMD-206-01",
      oemCode: "5750-Z6",
      name: "تسمه تایم ۲۰۶ — کیت کامل",
      brand: "پژو ۲۰۶",
      model: "TU3 / TU5",
      category: "موتور",
      unit: "ست",
      packSize: 1,
      minQty: 1,
      price: 4_850_000,
      stockQty: 22,
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 15, discountPercent: 9 },
      ],
    },
    {
      sku: "SHK-ABS-PRD-01",
      oemCode: "21110-3701200",
      name: "کمک فنر جلو پراید (جفتی)",
      brand: "پراید",
      model: "۱۳۱",
      category: "تعلیق",
      unit: "جفت",
      packSize: 1,
      minQty: 1,
      price: 3_900_000,
      stockQty: 48,
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 8 },
      ],
    },
    {
      sku: "BRK-SMD-F-01",
      oemCode: "4253-39",
      name: "لنت ترمز جلو سمند LX",
      brand: "سمند",
      model: "LX / EF7",
      category: "ترمز",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 1_980_000,
      stockQty: 72,
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 9 },
      ],
    },
    {
      sku: "FLT-FUEL-TBA-01",
      oemCode: "31910-1HC00",
      name: "فیلتر بنزین تیبا",
      brand: "تیبا",
      model: "همه مدل‌ها",
      category: "فیلتر",
      unit: "عدد",
      packSize: 5,
      minQty: 5,
      price: 275_000,
      stockQty: 150,
      volumePrices: [{ qtyFrom: 25, discountPercent: 6 }],
    },
  ];

  for (const p of products) {
    const { volumePrices, ...data } = p;

    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });

    if (existing) {
      console.log(`قطعه «${p.sku}» از قبل موجود بود — تغییری نکرد.`);
      continue;
    }

    await prisma.product.create({
      data: {
        ...data,
        volumePrices: { create: volumePrices },
      },
    });

    console.log(`قطعه «${p.name}» اضافه شد.`);
  }

  // --- مشتری نمایشی (برای تست سریع رابط) ---
  const demoTier = await prisma.tier.findUnique({ where: { name: "طلایی" } });
  let demo = await prisma.customer.findUnique({ where: { username: "demo" } });

  if (!demo) {
    demo = await prisma.customer.create({
      data: {
        companyName: "یدکی‌پخش نمونه کرمان",
        contactName: "مشتری نمایشی",
        phone: "09120000000",
        username: "demo",
        passwordHash: await argon2.hash("demo1234"),
        status: "ACTIVE",
        tierId: demoTier?.id,
        discountPercent: 0,
        address: "کرمان، خیابان نمونه",
      },
    });

    await prisma.walletTransaction.create({
      data: {
        customerId: demo.id,
        type: "TOPUP_MANUAL",
        amount: 5_000_000,
        balanceAfter: 5_000_000,
        refType: "MANUAL",
        idempotencyKey: "seed:demo:wallet",
        note: "موجودی نمایشی seed",
      },
    });

    console.log("\n👤 مشتری نمایشی ساخته شد: demo / demo1234 (کیف پول ۵٬۰۰۰٬۰۰۰ تومان)");
  } else {
    console.log("مشتری نمایشی «demo» از قبل موجود بود.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
