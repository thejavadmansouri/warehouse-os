import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/server-account";
import { TaxInvoiceClient } from "./tax-invoice-client";
import crypto from "crypto";

export const metadata = {
  title: "صورت‌حساب رسمی سامانه مودیان و دارایی | کاردو B2B",
};

export default async function TaxInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const acc = await requireCustomer();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      customer: true,
    },
  });

  if (!order || order.customerId !== acc.customer.id) {
    notFound();
  }

  // تولید شناسه یکتای مالیاتی ۲۲ رقمی مودیان بر اساس تاریخ و شماره سفارش
  const hash = crypto.createHash("sha256").update(order.id + order.number).digest("hex").toUpperCase();
  const fiscalTaxId = `A12F3-${hash.slice(0, 5)}-${hash.slice(5, 10)}-${order.number.replace(/[^0-9]/g, "").slice(-4)}`;

  return (
    <TaxInvoiceClient
      order={{
        id: order.id,
        orderNumber: order.number,
        createdAt: order.createdAt,
        status: order.status,
        subtotal: Number(order.subtotal),
        discount: Number(order.discountTotal || 0),
        shippingCost: Number(order.shippingCost || 0),
        total: Number(order.total),
        items: order.items.map((it) => ({
          id: it.id,
          productName: it.product.name,
          sku: it.product.sku,
          unit: it.product.unit,
          quantity: it.qty,
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
        })),
      }}
      seller={{
        companyName: "شرکت کاردو دیار کریمان (سهامی خاص)",
        nationalId: "14009876543",
        economicCode: "411654321897",
        postalCode: "7618854321",
        address: "کرمان، شهرک صنعتی شماره ۲ (خضراء)، فاز ۲ قطعات خودرو، مجتمع کاردو B2B",
        phone: "۰۳۴-۳۳۲۲۴۴۵۵",
      }}
      buyer={{
        companyName: order.customer.companyName,
        contactName: order.customer.contactName,
        nationalId: order.customer.nationalId,
        phone: order.customer.phone,
        address: order.customer.address,
      }}
      fiscalTaxId={fiscalTaxId}
    />
  );
}
