import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { ensureDefaultWarehouses } from "@/lib/warehouse";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  await ensureDefaultWarehouses();

  const warehouses = await prisma.warehouse.findMany({
    orderBy: [{ isCentral: "desc" }, { createdAt: "asc" }],
    include: {
      stocks: {
        select: {
          quantity: true,
          reservedQty: true,
        },
      },
      _count: {
        select: {
          stocks: true,
          transfersOut: true,
          transfersIn: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    warehouses: warehouses.map((wh) => {
      const totalQuantity = wh.stocks.reduce((sum, s) => sum + s.quantity, 0);
      const totalReserved = wh.stocks.reduce((sum, s) => sum + s.reservedQty, 0);

      return {
        id: wh.id,
        code: wh.code,
        name: wh.name,
        city: wh.city,
        address: wh.address,
        phone: wh.phone,
        managerName: wh.managerName,
        isCentral: wh.isCentral,
        isActive: wh.isActive,
        productTypesCount: wh._count.stocks,
        totalQuantity,
        totalReserved,
        availableQuantity: totalQuantity - totalReserved,
      };
    }),
  });
}

const createWarehouseSchema = z.object({
  code: z.string().trim().min(3, "کد انبار باید حداقل ۳ حرف باشد"),
  name: z.string().trim().min(2, "نام انبار الزامی است"),
  city: z.string().trim().min(2, "شهر محل استقرار انبار الزامی است"),
  address: z.string().trim().min(5, "آدرس انبار الزامی است"),
  phone: z.string().trim().optional(),
  managerName: z.string().trim().optional(),
  isCentral: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const data = parsed.data;

  const existing = await prisma.warehouse.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    return apiError(400, "DUPLICATE_CODE", "انباری با این کد اختصاصی قبلاً ثبت شده است");
  }

  const warehouse = await prisma.warehouse.create({
    data: {
      code: data.code,
      name: data.name,
      city: data.city,
      address: data.address,
      phone: data.phone || null,
      managerName: data.managerName || null,
      isCentral: data.isCentral,
    },
  });

  return NextResponse.json({
    ok: true,
    warehouse,
  });
}
