import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function validateApiKey(req: NextRequest) {
  const headerKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!headerKey) {
    return { ok: false, error: "کلید API ارائه نشده است (هدر x-api-key الزامی است)" };
  }

  const record = await prisma.apiKey.findUnique({
    where: { key: headerKey },
  });

  if (!record || !record.isActive) {
    return { ok: false, error: "کلید API نامعتبر است یا غیرفعال شده است" };
  }

  // ثبت زمان آخرین استفاده
  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { ok: true, apiKey: record };
}
