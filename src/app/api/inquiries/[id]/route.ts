import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ message: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const { id } = await params;

  const inquiry = await prisma.inquiry.findFirst({
    where: { id, customerId: user.customer.id },
    include: {
      items: true,
    },
  });

  if (!inquiry) {
    return NextResponse.json({ message: "استعلام یافت نشد" }, { status: 404 });
  }

  return NextResponse.json({ inquiry });
}
