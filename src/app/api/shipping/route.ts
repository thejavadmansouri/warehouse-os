import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** روش‌های ارسال فعال — عمومی (نیازی به نشست ندارد). */
export async function GET() {
  const methods = await prisma.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, cost: true, freeAbove: true, note: true },
  });

  return NextResponse.json({
    ok: true,
    methods: methods.map((m) => ({
      ...m,
      cost: Number(m.cost),
      freeAbove: m.freeAbove ? Number(m.freeAbove) : null,
    })),
  });
}
