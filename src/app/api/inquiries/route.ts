import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { nextInquiryNumber } from "@/lib/numbering";
import { z } from "zod";

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  partName: z.string().min(1, "نام قطعه الزامی است"),
  sku: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  qty: z.number().int().min(1, "حداقل تعداد ۱ است"),
  unit: z.string().default("عدد"),
  targetPrice: z.number().optional().nullable(),
});

const createSchema = z.object({
  customerNote: z.string().max(500).optional().nullable(),
  items: z.array(itemSchema).min(1, "حداقل یک قلم کالا برای استعلام الزامی است"),
});

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ message: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const inquiries = await prisma.inquiry.findMany({
    where: { customerId: user.customer.id },
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ inquiries });
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ message: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر" },
      { status: 400 },
    );
  }

  const number = await nextInquiryNumber();

  const inquiry = await prisma.inquiry.create({
    data: {
      number,
      customerId: user.customer.id,
      customerNote: parsed.data.customerNote?.trim() || null,
      status: "PENDING",
      items: {
        create: parsed.data.items.map((item) => ({
          productId: item.productId || null,
          partName: item.partName.trim(),
          sku: item.sku?.trim() || null,
          brand: item.brand?.trim() || null,
          model: item.model?.trim() || null,
          qty: item.qty,
          unit: item.unit || "عدد",
          targetPrice: item.targetPrice ? Math.round(item.targetPrice) : null,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  return NextResponse.json({ inquiry }, { status: 201 });
}
