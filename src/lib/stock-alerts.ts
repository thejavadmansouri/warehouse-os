import { prisma } from "@/lib/prisma";

/**
 * اطلاع‌رسانی خودکار به متقاضیان کالاهایی که مجدداً در انبار موجود شده‌اند
 */
export async function notifyBackInStock(productId: string, newQty: number) {
  if (newQty <= 0) return;

  const alerts = await prisma.stockAlert.findMany({
    where: {
      productId,
      notifiedAt: null,
    },
    include: {
      product: {
        select: { name: true, sku: true },
      },
      customer: {
        select: { id: true, phone: true, companyName: true },
      },
    },
  });

  if (alerts.length === 0) return;

  const productName = alerts[0].product.name;
  const now = new Date();

  for (const alert of alerts) {
    // ۱. ایجاد نوتیفیکیشن درون‌برنامه‌ای
    await prisma.notification.create({
      data: {
        customerId: alert.customerId,
        title: "کالای درخواستی شما موجود شد 🔔",
        message: `قطعه «${productName}» هم‌اکنون به تعداد ${newQty} عدد در انبار مرکزی شارژ شد و آماده ثبت سفارش است.`,
        type: "SYSTEM",
        link: `/catalog?q=${encodeURIComponent(alert.product.sku)}`,
        read: false,
        smsSent: true, // شبیه‌سازی ارسال پیامک
      },
    });

    // ۲. ثبت زمان اطلاع‌رسانی روی اشتراک
    await prisma.stockAlert.update({
      where: { id: alert.id },
      data: { notifiedAt: now },
    });
  }
}
