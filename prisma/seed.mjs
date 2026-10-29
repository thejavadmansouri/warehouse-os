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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
