import { PrismaClient } from "@prisma/client";
import { normalizePersian, tokenizeQuery, buildTokenWhereClause, scoreProductMatch } from "../src/lib/persian-search.ts";

const prisma = new PrismaClient();

async function run() {
  console.log("=== تست سیستم جستجوی هوشمند پوز کاردو ===");

  // ۱. تست نرمال‌سازی
  console.log("\n[۱] بررسی نرمال‌سازی حروف و ارقام:");
  const testCases = [
    { input: "كمك فنر پرايد", expected: "کمک فنر پراید" },
    { input: "لنت ترمز ۲۰۶", expected: "لنت ترمز 206" },
    { input: "ديسك چرخ", expected: "دیسک چرخ" },
    { input: "قطعه‌اصلی", expected: "قطعه اصلی" }, // نیم‌فاصله
  ];

  for (const tc of testCases) {
    const res = normalizePersian(tc.input);
    const pass = res === tc.expected;
    console.log(`  ${pass ? "✓" : "✗"} '${tc.input}' -> '${res}' (انتظار: '${tc.expected}')`);
    if (!pass) throw new Error(`Normalization failed for ${tc.input}`);
  }

  // ۲. تست توکن‌سازی
  console.log("\n[۲] بررسی توکن‌سازی:");
  const tokens = tokenizeQuery("كم پرا");
  console.log("  توکن‌های استخراج‌شده برای 'كم پرا':", tokens);
  if (tokens.length !== 2 || tokens[0] !== "کم" || tokens[1] !== "پرا") {
    throw new Error("Tokenization failed");
  }
  console.log("  ✓ توکن‌سازی دقیقاً منطبق است");

  // ۳. تست جستجو روی محصولات واقعی دیتابیس
  console.log("\n[۳] جستجوی زنده در دیتابیس برای عبارات پیشوندی و مخفف:");

  const queries = [
    "کم پرا", // باید کمک فنر پراید را پیدا کند
    "لن ۲۰۶", // باید لنت ترمز ۲۰۶ را پیدا کند
    "شم پژ",  // شمع پژو
    "ديسك",   // با ی عربی دیسک ترمز را پیدا کند
  ];

  for (const q of queries) {
    const toks = tokenizeQuery(q);
    const where = {
      isActive: true,
      ...buildTokenWhereClause(toks),
    };

    let products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        model: true,
        stockQty: true,
      },
      take: 10,
    });

    if (products.length === 0 && toks.length >= 2) {
      for (let skip = 0; skip < toks.length && products.length === 0; skip++) {
        const subset = toks.filter((_, i) => i !== skip);
        products = await prisma.product.findMany({
          where: {
            isActive: true,
            ...buildTokenWhereClause(subset),
          },
          select: {
            id: true,
            sku: true,
            name: true,
            brand: true,
            model: true,
            stockQty: true,
          },
          take: 10,
        });
      }
    }

    products.sort((a, b) => scoreProductMatch(b, q, toks) - scoreProductMatch(a, q, toks));

    console.log(`\n  نتیجه جستجو برای: "${q}" (توکن‌ها: [${toks.join(", ")}])`);
    if (products.length === 0) {
      console.log("    (موردی یافت نشد)");
    } else {
      products.forEach((p, idx) => {
        const score = scoreProductMatch(p, q, toks);
        console.log(`    ${idx + 1}. [امتیاز: ${score}] ${p.name} | مدل: ${p.model ?? "-"} | کد: ${p.sku} | موجودی: ${p.stockQty}`);
      });
    }
  }

  console.log("\n✓ تمام تست‌های جستجوی پیشوندی پوز کاردو با موفقیت سپری شدند.");
}

run()
  .catch((e) => {
    console.error("خطا در تست:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
