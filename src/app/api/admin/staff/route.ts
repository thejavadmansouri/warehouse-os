import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import argon2 from "argon2";

/*
 * مدیریت پرسنل و حسابداران سیستم کاردو
 * فقط مدیر ارشد (ADMIN) می‌تواند پرسنل جدید (حسابدار / انباردار / مدیر) تعریف کند.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مخصوص مدیر ارشد است");
  }

  const staff = await prisma.adminUser.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, staff });
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مخصوص مدیر ارشد است");
  }

  try {
    const body = await req.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "ACCOUNTANT").toUpperCase(); // ACCOUNTANT, WAREHOUSE, ADMIN

    if (!username || username.length < 3) {
      return apiError(400, "VALIDATION", "نام کاربری باید حداقل ۳ کاراکتر باشد");
    }

    if (!password || password.length < 6) {
      return apiError(400, "VALIDATION", "کلمه عبور باید حداقل ۶ کاراکتر باشد");
    }

    const exists = await prisma.adminUser.findUnique({ where: { username } });
    if (exists) {
      return apiError(409, "DUPLICATE_USERNAME", "این نام کاربری قبلاً ثبت شده است");
    }

    const passwordHash = await argon2.hash(password);

    const created = await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        name: name || null,
        role,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, staff: created }, { status: 201 });
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
    const { id, isActive, role, newPassword } = body;

    if (!id) {
      return apiError(400, "MISSING_ID", "شناسه کاربر الزامی است");
    }

    const data: any = {};
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (role) data.role = role;
    if (newPassword && newPassword.length >= 6) {
      data.passwordHash = await argon2.hash(newPassword);
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    return NextResponse.json({ ok: true, staff: updated });
  } catch (err: any) {
    return apiError(500, "SERVER_ERROR", err.message);
  }
}
