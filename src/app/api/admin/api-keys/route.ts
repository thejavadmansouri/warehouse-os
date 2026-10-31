import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import crypto from "crypto";

/*
 * مدیریت کلیدهای وب‌سرویس حسابداری
 */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مخصوص مدیر ارشد است");
  }

  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, keys });
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مخصوص مدیر ارشد است");
  }

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const system = String(body.system ?? "PARSIAN").toUpperCase();

    if (!name) {
      return apiError(400, "VALIDATION", "نام اتصال یا نرم‌افزار الزامی است");
    }

    // ایجاد کلید رندوم امن: kardo_acc_xxx
    const randomBytes = crypto.randomBytes(24).toString("hex");
    const key = `kardo_acc_${randomBytes}`;

    const record = await prisma.apiKey.create({
      data: {
        name,
        key,
        system,
        role: "ACCOUNTING",
        isActive: true,
      },
    });

    return NextResponse.json({ ok: true, apiKey: record }, { status: 201 });
  } catch (err: any) {
    return apiError(500, "SERVER_ERROR", err.message);
  }
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مخصوص مدیر ارشد است");
  }

  try {
    const body = await req.json();
    const { id, isActive } = body;

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
    });

    return NextResponse.json({ ok: true, apiKey: updated });
  } catch (err: any) {
    return apiError(500, "SERVER_ERROR", err.message);
  }
}
