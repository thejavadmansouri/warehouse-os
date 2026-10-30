import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { nextOrderNumber } from "@/lib/numbering";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ message: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const shippingId = (body.shippingId as string) || null;

  const inquiry = await prisma.inquiry.findFirst({
    where: { id, customerId: user.customer.id },
    include: { items: true },
  });

  if (!inquiry) {
    return NextResponse.json({ message: "استعلام یافت نشد" }, { status: 404 });
  }

  if (inquiry.status !== "ANSWERED") {
    return NextResponse.json(
      { message: "تنها استعلام‌های قیمت‌گذاری شده قابل تبدیل به پیش‌فاکتور هستند" },
      { status: 400 },
    );
  }

  const validItems = inquiry.items.filter(
    (i) => i.quotedUnitPrice && Number(i.quotedUnitPrice) > 0,
  );

  if (validItems.length === 0) {
    return NextResponse.json(
      { message: "هیچ قیمتی برای اقلام این استعلام ثبت نشده است" },
      { status: 400 },
    );
  }

  const shipping = shippingId
    ? await prisma.shippingMethod.findUnique({ where: { id: shippingId } })
    : await prisma.shippingMethod.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      });

  const subtotal = validItems.reduce((acc, it) => {
    const unitPrice = Number(it.quotedUnitPrice || 0);
    return acc + unitPrice * it.qty;
  }, 0);

  const shippingCost =
    shipping && !(shipping.freeAbove && subtotal >= Number(shipping.freeAbove))
      ? Number(shipping.cost)
      : 0;

  const total = subtotal + shippingCost;
  const orderNumber = await nextOrderNumber();
  const publicToken = crypto.randomUUID().replace(/-/g, "");

  const result = await prisma.$transaction(async (tx) => {
    const defaultProduct = await tx.product.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const order = await tx.order.create({
      data: {
        number: orderNumber,
        customerId: user.customer.id,
        status: "PROFORMA",
        shippingId: shipping?.id || null,
        shippingCost,
        subtotal,
        discountTotal: 0,
        total,
        publicToken,
        note: `برگرفته از استعلام شماره ${inquiry.number}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        items: {
          create: validItems.map((it) => {
            const unitPrice = Number(it.quotedUnitPrice || 0);
            return {
              productId: it.productId || defaultProduct?.id || "",
              name: it.partName,
              sku: it.sku || `RFQ-${it.id.slice(-6)}`,
              unit: it.unit || "عدد",
              qty: it.qty,
              unitPrice,
              discountPercent: 0,
              lineTotal: unitPrice * it.qty,
            };
          }),
        },
      },
      include: {
        items: true,
      },
    });

    await tx.inquiry.update({
      where: { id: inquiry.id },
      data: {
        status: "CONVERTED",
        convertedOrderId: order.id,
      },
    });

    return order;
  });

  return NextResponse.json({ order: result }, { status: 200 });
}
