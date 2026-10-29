import { PrismaClient } from "@prisma/client";

/*
 * کلاینت تک‌نمونه — مثل کاردو. در dev با هر هات‌ریلود اتصال جدید ساخته نشود
 * (Next ماژول را کش می‌کند تا اتصال‌ها از حوضچه خارج نشوند).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
