import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { readSessionToken } from "@/lib/auth-cookie";

/*
 * «من کی‌ام؟» — داشبورد و لایه گیت از روی این داده تصمیم می‌گیرد.
 * status همیشه از DB می‌آید نه توکن — ادمین ممکن است پس از صدور توکن وضعیت را عوض کند.
 */
export async function GET(req: NextRequest) {
  const session = await verifySession(readSessionToken(req) ?? "");

  if (!session) {
    return NextResponse.json({ ok: false, error: "ANON", message: "وارد نشده‌اید" }, { status: 401 });
  }

  if (session.role === "admin") {
    const admin = await prisma.adminUser.findUnique({
      where: { id: session.sub },
      select: { id: true, username: true, name: true },
    });

    if (!admin) {
      return NextResponse.json({ ok: false, error: "ANON" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, role: "admin", id: admin.id, username: admin.username, name: admin.name });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      phone: true,
      status: true,
      tier: { select: { name: true, baseDiscount: true, creditLimit: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ ok: false, error: "ANON" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, role: "customer", ...customer });
}
