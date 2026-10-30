import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت RMA الزامی است");
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const reason = searchParams.get("reason") || undefined;
  const q = searchParams.get("q")?.trim() || undefined;

  const whereClause: any = {};
  if (status && status !== "ALL") whereClause.status = status;
  if (reason && reason !== "ALL") whereClause.reason = reason;
  if (q) {
    whereClause.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { product: { name: { contains: q, mode: "insensitive" } } },
      { product: { sku: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rmas = await prisma.rmaRequest.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      customer: {
        select: {
          id: true,
          companyName: true,
          phone: true,
        },
      },
      order: {
        select: {
          id: true,
          number: true,
          createdAt: true,
        },
      },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          brand: true,
          partBrand: true,
          unit: true,
        },
      },
    },
  });

  const [totalPending, totalApproved, totalRefunded] = await Promise.all([
    prisma.rmaRequest.count({ where: { status: "PENDING" } }),
    prisma.rmaRequest.count({ where: { status: "APPROVED" } }),
    prisma.rmaRequest.count({ where: { status: "REFUNDED" } }),
  ]);

  return NextResponse.json({
    ok: true,
    stats: {
      totalPending,
      totalApproved,
      totalRefunded,
    },
    rmas: rmas.map((r) => ({
      id: r.id,
      number: r.number,
      customerName: r.customer.companyName,
      customerPhone: r.customer.phone,
      orderNumber: r.order.number,
      orderId: r.order.id,
      productName: r.product.name,
      sku: r.product.sku,
      brand: r.product.brand,
      partBrand: r.product.partBrand,
      qty: r.qty,
      unit: r.product.unit,
      reason: r.reason,
      customerNote: r.customerNote,
      adminNote: r.adminNote,
      status: r.status,
      refundAmount: r.refundAmount ? Number(r.refundAmount) : 0,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() || null,
    })),
  });
}
