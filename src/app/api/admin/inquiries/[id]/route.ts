import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { z } from "zod";

const updateSchema = z.object({
  adminNote: z.string().optional().nullable(),
  status: z.enum(["PENDING", "ANSWERED", "REJECTED"]).optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        quotedUnitPrice: z.number().min(0).optional().nullable(),
        adminNote: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const { id } = await params;
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          address: true,
        },
      },
      items: true,
    },
  });

  if (!inquiry) {
    return NextResponse.json({ message: "استعلام یافت نشد" }, { status: 404 });
  }

  return NextResponse.json({ inquiry });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "داده‌های ورودی نامعتبر است" }, { status: 400 });
  }

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!inquiry) {
    return NextResponse.json({ message: "استعلام یافت نشد" }, { status: 404 });
  }

  const updatedInquiry = await prisma.$transaction(async (tx) => {
    let totalQuoted = 0;

    if (parsed.data.items && parsed.data.items.length > 0) {
      for (const it of parsed.data.items) {
        const currentItem = inquiry.items.find((i) => i.id === it.id);
        if (!currentItem) continue;

        const quotedPrice = it.quotedUnitPrice !== undefined ? it.quotedUnitPrice : Number(currentItem.quotedUnitPrice || 0);
        const lineTotal = quotedPrice !== null && quotedPrice !== undefined ? Math.round(quotedPrice * currentItem.qty) : null;

        if (lineTotal) totalQuoted += lineTotal;

        await tx.inquiryItem.update({
          where: { id: it.id },
          data: {
            quotedUnitPrice: quotedPrice !== null && quotedPrice !== undefined ? Math.round(quotedPrice) : null,
            lineTotal,
            adminNote: it.adminNote !== undefined ? it.adminNote?.trim() || null : currentItem.adminNote,
          },
        });
      }
    } else {
      totalQuoted = inquiry.items.reduce((acc, i) => acc + Number(i.lineTotal || 0), 0);
    }

    const nextStatus = parsed.data.status ?? (totalQuoted > 0 ? "ANSWERED" : inquiry.status);

    return tx.inquiry.update({
      where: { id },
      data: {
        adminNote: parsed.data.adminNote !== undefined ? parsed.data.adminNote?.trim() || null : inquiry.adminNote,
        status: nextStatus,
        totalQuoted: totalQuoted > 0 ? totalQuoted : inquiry.totalQuoted,
      },
      include: {
        items: true,
      },
    });
  });

  return NextResponse.json({ inquiry: updatedInquiry });
}
