/*
 * Seed پایگاه‌داده کاردو B2B:
 * - ادمین سیستم
 * - طبقه‌های همکاران (طلایی، نقره‌ای، برنزی)
 * - روش‌های ارسال باربری کرمان
 * - محصولات متنوع با قطعه‌سازان برتر، خودروهای ایران‌خودرو و سایپا، بخش‌های فنی و تاریخ‌های متنوع
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  // --- ادمین ---
  const username = "admin";
  const password = process.env.ADMIN_PASSWORD || "admin1234";

  const existingAdmin = await prisma.adminUser.findUnique({ where: { username } });

  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        username,
        passwordHash: await argon2.hash(password),
        name: "مدیر ارشد کاردو",
      },
    });
    console.log(`✅ ادمین ساخته شد: ${username} / ${password}`);
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
      update: {},
      create: t,
    });
  }

  // --- روش‌های ارسال ---
  const shipping = [
    {
      code: "PICKUP",
      name: "تحویل حضوری — انبار مرکزی کرمان",
      cost: 0,
      freeAbove: null,
      note: "تحویل فوری در شهرک صنعتی ۲ کرمان",
      sortOrder: 1,
    },
    {
      code: "KERMAN_COURIER",
      name: "پیک اکسپرس شهری کرمان",
      cost: 80_000,
      freeAbove: 3_000_000,
      note: "ارسال سریع در سطح شهر کرمان",
      sortOrder: 2,
    },
    {
      code: "FREIGHT",
      name: "ارسال باربری بین‌شهری (پس‌کرایه)",
      cost: 0,
      freeAbove: null,
      note: "تحویل به باربری‌های معتبر (وطن، پیام شمس، پیشتاز)",
      sortOrder: 3,
    },
  ];

  for (const s of shipping) {
    await prisma.shippingMethod.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
  }

  // --- محصولات با دسته‌بندی فنی، سازندگان و تاریخ‌های ورود ---
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;

  const products = [
    {
      sku: "BRK-PRD-F-01",
      oemCode: "21110-3701100",
      name: "لنت ترمز جلو پراید کره‌ای",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱ / صبا",
      category: "سیستم ترمز",
      partBrand: "گلد (Gold)",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 1_480_000,
      stockQty: 120,
      createdAt: new Date(now - 2 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 4 },
        { qtyFrom: 20, discountPercent: 8 },
        { qtyFrom: 50, discountPercent: 12 },
      ],
    },
    {
      sku: "BRK-PRD-R-01",
      oemCode: "21120-3701100",
      name: "لنت ترمز عقب پراید شرکتی",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "سیستم ترمز",
      partBrand: "سایپا یدک",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 1_260_000,
      stockQty: 84,
      createdAt: new Date(now - 15 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 4 },
        { qtyFrom: 20, discountPercent: 8 },
      ],
    },
    {
      sku: "BRK-206-F-01",
      oemCode: "4253-38",
      name: "لنت ترمز جلو پژو ۲۰۶ تیپ ۲ و ۵",
      brand: "پژو ۲۰۶",
      model: "تیپ ۲ / ۵",
      category: "سیستم ترمز",
      partBrand: "امکو (Emco)",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 2_150_000,
      stockQty: 60,
      createdAt: new Date(now - 4 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 9 },
      ],
    },
    {
      sku: "BRK-DSC-PRD-01",
      oemCode: "21100-3701500",
      name: "دیسک ترمز چرخ جلو پراید تهویه‌دار",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "سیستم ترمز",
      partBrand: "عظام",
      unit: "عدد",
      packSize: 2,
      minQty: 2,
      price: 1_725_000,
      stockQty: 40,
      createdAt: new Date(now - 25 * DAY),
      volumePrices: [
        { qtyFrom: 10, discountPercent: 6 },
        { qtyFrom: 30, discountPercent: 10 },
      ],
    },
    {
      sku: "FLT-OIL-PRD-01",
      oemCode: "26300-35503",
      name: "فیلتر روغن پراید و تیبا سرکان",
      brand: "پراید",
      model: "همه مدل‌ها / تیبا",
      category: "فیلتراسیون",
      partBrand: "سرکان",
      unit: "عدد",
      packSize: 10,
      minQty: 10,
      price: 185_000,
      stockQty: 500,
      createdAt: new Date(now - 1 * DAY),
      volumePrices: [
        { qtyFrom: 50, discountPercent: 5 },
        { qtyFrom: 200, discountPercent: 10 },
      ],
    },
    {
      sku: "FLT-AIR-PRD-01",
      oemCode: "28113-02500",
      name: "فیلتر هوا پراید انژکتوری",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "فیلتراسیون",
      partBrand: "سرکان",
      unit: "عدد",
      packSize: 5,
      minQty: 5,
      price: 245_000,
      stockQty: 300,
      createdAt: new Date(now - 8 * DAY),
      volumePrices: [
        { qtyFrom: 25, discountPercent: 5 },
        { qtyFrom: 100, discountPercent: 9 },
      ],
    },
    {
      sku: "SPK-BOSCH-01",
      oemCode: "FR7DC+",
      name: "شمع تک‌پلاتین بوش آلمان پایه کوتاه",
      brand: "پژو ۴۰۵",
      model: "پژو ۴۰۵ / پارس / سمند",
      category: "برق و سنسور",
      partBrand: "بوش (Bosch)",
      unit: "دست (۴تایی)",
      packSize: 4,
      minQty: 4,
      price: 780_000,
      stockQty: 180,
      createdAt: new Date(now - 3 * DAY),
      volumePrices: [
        { qtyFrom: 20, discountPercent: 5 },
        { qtyFrom: 80, discountPercent: 10 },
      ],
    },
    {
      sku: "GSK-HD-SMD-01",
      oemCode: "21211-3701100",
      name: "واشر سرسیلندر سمند و دنا موتور EF7",
      brand: "سمند",
      model: "EF7 / دنا",
      category: "قطعات موتور",
      partBrand: "ایساکو",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 890_000,
      stockQty: 35,
      createdAt: new Date(now - 18 * DAY),
      volumePrices: [{ qtyFrom: 5, discountPercent: 6 }],
    },
    {
      sku: "BLT-TMD-206-01",
      oemCode: "5750-Z6",
      name: "تسمه تایم دایکو پژو ۲۰۶ تیپ ۵ (۱۳۴ دندانه)",
      brand: "پژو ۲۰۶",
      model: "موتور TU5 / رانا",
      category: "قطعات موتور",
      partBrand: "دایکو (Dayco)",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 1_850_000,
      stockQty: 55,
      createdAt: new Date(now - 5 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 15, discountPercent: 9 },
      ],
    },
    {
      sku: "SHK-ABS-PRD-01",
      oemCode: "21110-3701200",
      name: "کمک فنر جلو پراید عظام روغنی",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "جلوبندی و تعلیق",
      partBrand: "عظام",
      unit: "جفت",
      packSize: 1,
      minQty: 1,
      price: 3_900_000,
      stockQty: 48,
      createdAt: new Date(now - 45 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 8 },
      ],
    },
    {
      sku: "CLT-KIT-405-01",
      oemCode: "826360",
      name: "کیت کلاچ کامل والئو سبز پژو ۴۰۵ و پارس",
      brand: "پژو ۴۰۵",
      model: "XU7 / پارس / سمند",
      category: "گیربکس و کلاچ",
      partBrand: "والئو (Valeo)",
      unit: "کیت",
      packSize: 1,
      minQty: 1,
      price: 4_650_000,
      stockQty: 32,
      createdAt: new Date(now - 6 * DAY),
      volumePrices: [
        { qtyFrom: 3, discountPercent: 4 },
        { qtyFrom: 10, discountPercent: 8 },
      ],
    },
    {
      sku: "CLT-KIT-PRD-01",
      oemCode: "200-PRD-PC",
      name: "کیت کلاچ پراید ۲۰۰ میل پایا کلاچ",
      brand: "پراید",
      model: "۱۳۱ / صبا",
      category: "گیربکس و کلاچ",
      partBrand: "پایا کلاچ",
      unit: "کیت",
      packSize: 1,
      minQty: 1,
      price: 2_950_000,
      stockQty: 45,
      createdAt: new Date(now - 12 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 15, discountPercent: 9 },
      ],
    },
    {
      sku: "RAD-WTR-206-01",
      oemCode: "1330-J4",
      name: "رادیاتور آب دو لول پژو ۲۰۶ کوشش رادیاتور",
      brand: "پژو ۲۰۶",
      model: "تیپ ۲ / ۵",
      category: "سیستم خنک‌کننده",
      partBrand: "ایساکو",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 2_450_000,
      stockQty: 26,
      createdAt: new Date(now - 20 * DAY),
      volumePrices: [{ qtyFrom: 5, discountPercent: 6 }],
    },
    {
      sku: "WTR-PMP-405-01",
      oemCode: "1201-E8",
      name: "واتر پمپ پژو ۴۰۵ و پارس ایساکو",
      brand: "پژو ۴۰۵",
      model: "XU7",
      category: "سیستم خنک‌کننده",
      partBrand: "ایساکو",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 920_000,
      stockQty: 58,
      createdAt: new Date(now - 14 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 9 },
      ],
    },
    {
      sku: "PMP-GAS-L90-01",
      oemCode: "17202-0027R",
      name: "مغزی پمپ بنزین تندر ۹۰ (ال۹۰) اصلی",
      brand: "رنو ال۹۰",
      model: "E1 / E2 / ساندرو",
      category: "سوخت‌رسانی",
      partBrand: "بوش (Bosch)",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 1_350_000,
      stockQty: 38,
      createdAt: new Date(now - 2 * DAY),
      volumePrices: [{ qtyFrom: 5, discountPercent: 5 }],
    },
    {
      sku: "BLT-ALT-DENA-01",
      oemCode: "6PK-1815",
      name: "تسمه دینام دنا پلاس توربو ۶PK",
      brand: "دنا پلاس",
      model: "EF7 توربو / دنا پلاس",
      category: "قطعات موتور",
      partBrand: "دایکو (Dayco)",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 980_000,
      stockQty: 42,
      createdAt: new Date(now - 7 * DAY),
      volumePrices: [{ qtyFrom: 5, discountPercent: 6 }],
    },
    {
      sku: "ARM-BAL-PRD-01",
      oemCode: "21100-3401100",
      name: "جعبه فرمان مکانیکی پراید تقویت‌شده",
      brand: "پراید",
      model: "۱۳۱ / ۱۱۱",
      category: "جلوبندی و تعلیق",
      partBrand: "عظام",
      unit: "عدد",
      packSize: 1,
      minQty: 1,
      price: 3_250_000,
      stockQty: 18,
      createdAt: new Date(now - 28 * DAY),
      volumePrices: [{ qtyFrom: 3, discountPercent: 5 }],
    },
    {
      sku: "FLT-CAB-206-01",
      oemCode: "6447-AZ",
      name: "فیلتر هوای کابین پژو ۲۰۶ و ۲۰۷",
      brand: "پژو ۲۰۶",
      model: "تیپ ۲ / ۵ / ۲۰۷",
      category: "فیلتراسیون",
      partBrand: "سرکان",
      unit: "عدد",
      packSize: 5,
      minQty: 5,
      price: 165_000,
      stockQty: 210,
      createdAt: new Date(now - 3 * DAY),
      volumePrices: [
        { qtyFrom: 20, discountPercent: 6 },
        { qtyFrom: 50, discountPercent: 10 },
      ],
    },
    {
      sku: "BRK-TBA-F-01",
      oemCode: "500432-TBA",
      name: "لنت ترمز جلو تیبا و ساینا و کوییک",
      brand: "تیبا",
      model: "تیبا ۲ / ساینا / کوییک",
      category: "سیستم ترمز",
      partBrand: "امکو (Emco)",
      unit: "جین",
      packSize: 1,
      minQty: 1,
      price: 1_650_000,
      stockQty: 95,
      createdAt: new Date(now - 1 * DAY),
      volumePrices: [
        { qtyFrom: 5, discountPercent: 5 },
        { qtyFrom: 20, discountPercent: 9 },
      ],
    },
  ];

  for (const p of products) {
    const { volumePrices, ...data } = p;

    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        ...data,
      },
      create: {
        ...data,
        volumePrices: { create: volumePrices },
      },
    });

    console.log(`قطعه «${p.name}» بروزرسانی/اضافه شد.`);
  }

  // --- مشتری نمایشی ---
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
        address: "کرمان، بلوار جمهوری",
      },
    });

    await prisma.walletTransaction.create({
      data: {
        customerId: demo.id,
        type: "TOPUP_MANUAL",
        amount: 5_000_000,
        balanceAfter: 5_000_000,
        refType: "MANUAL",
        idempotencyKey: "seed:demo:wallet:initial",
        note: "موجودی نمایشی seed",
      },
    });

    console.log("\n👤 مشتری نمایشی ساخته شد: demo / demo1234 (کیف پول ۵٬۰۰۰٬۰۰۰ تومان)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
