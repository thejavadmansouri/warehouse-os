import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { verifySession } from "@/lib/session";
import { readSessionToken } from "@/lib/auth-cookie";

/*
 * اکشن‌های ادمین روی یک مشتری: تأیید / رد / مسدود / آزاد‌سازی.
 * PATCH — تغییر وضعیت. حقیقتِ وضعیت همیشه همین‌جا می‌نویسد؛ توکن مشتری
 * بازسازی نمی‌شود چون status از DB خوانده می‌شود در هر درخواست.
 */
async function requireAdmin(req: NextRequest) {
  const session = await verifySession(readSessionToken(req) ?? "");

  if (!session || session.role !== "admin") return null;

  const admin = await prisma.adminUser.findUnique({ where: { id: session.sub } });

  return admin ?? null;
}

const patchSchema = z.object({
  action: z.enum(["activate", "reject", "block", "unblock"]),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(req))) {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", "action نامعتبر است");
  }

  const statusOf: Record<string, "ACTIVE" | "REJECTED" | "BLOCKED"> = {
    activate: "ACTIVE",
    reject: "REJECTED",
    block: "BLOCKED",
    unblock: "ACTIVE",
  };

  const customer = await prisma.customer.update({
    where: { id },
    data: { status: statusOf[parsed.data.action] },
  }).catch(() => null);

  if (!customer) {
    return apiError(404, "NOT_FOUND", "مشتری پیدا نشد");
  }

  return NextResponse.json({ ok: true, status: customer.status });
}
