import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");
  if (user.role === "admin") {
    return NextResponse.json({
      ok: true,
      unreadCount: 0,
      notifications: [],
    });
  }
  if (user.role !== "customer") return apiError(403, "CUSTOMER_ONLY", "مسیر مخصوص مشتریان است");

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { customerId: user.customer.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.notification.count({
      where: { customerId: user.customer.id, read: false },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");
  if (user.role !== "customer") return apiError(403, "CUSTOMER_ONLY", "مسیر مخصوص مشتریان است");

  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;

  if (id) {
    await prisma.notification.updateMany({
      where: { id, customerId: user.customer.id },
      data: { read: true },
    });
  } else {
    // علامت‌گذاری همه به عنوان خوانده شده
    await prisma.notification.updateMany({
      where: { customerId: user.customer.id, read: false },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}
