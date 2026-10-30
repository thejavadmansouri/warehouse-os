/**
 * کاردو B2B — مدیریت جامع سیستم چندانباره (Multi-Warehouse) استان کرمان
 * انبار مرکزی کرمان، انبارهای منطقه‌ای رفسنجان، سیرجان، جیرفت و حواله‌های جابجایی بین‌شهری
 */

import { prisma } from "@/lib/prisma";

export const DEFAULT_KERMAN_WAREHOUSES = [
  {
    code: "WH-KERMAN-CENTRAL",
    name: "انبار مرکزی کاردو کرمان",
    city: "کرمان",
    address: "کرمان، شهرک صنعتی شماره ۱ (خضراء)، بلوار مهارت، سوله ۴ و ۵",
    phone: "034-33200000",
    managerName: "مهندس ابراهیمی (سرپرست انبار مرکزی)",
    isCentral: true,
  },
  {
    code: "WH-RAF-01",
    name: "انبار و هاب توزیع رفسنجان",
    city: "رفسنجان",
    address: "رفسنجان، بلوار امیرکبیر، نرسیده به میدان قدس، انبار توزیع کاردو",
    phone: "034-34201010",
    managerName: "آقای حسینی (مسئول انبار رفسنجان)",
    isCentral: false,
  },
  {
    code: "WH-SIR-01",
    name: "انبار منطقه‌ای و تحویل سیرجان",
    city: "سیرجان",
    address: "سیرجان، بلوار امام رضا، جنب میدان بار و پایانه، مجتمع توزیع قطعات",
    phone: "034-42202020",
    managerName: "آقای پورعلی (مسئول انبار سیرجان)",
    isCentral: false,
  },
  {
    code: "WH-JIR-01",
    name: "انبار و مرکز پخش جنوب استان (جیرفت)",
    city: "جیرفت",
    address: "جیرفت، بلوار پاسداران، شهرک صنعتی جیرفت، انبار پخش جنوب کاردو",
    phone: "034-43203030",
    managerName: "آقای میرزایی (مسئول انبار جنوب)",
    isCentral: false,
  },
];

export async function ensureDefaultWarehouses() {
  const count = await prisma.warehouse.count();
  if (count === 0) {
    for (const wh of DEFAULT_KERMAN_WAREHOUSES) {
      await prisma.warehouse.create({
        data: wh,
      });
    }
  }

  // همچنین اگر انبار مرکزی است، بررسی کنیم که آیا کالاهای بدون موجودی نیاز به ثبت در انبار مرکزی دارند
  const central = await prisma.warehouse.findFirst({ where: { isCentral: true } });
  if (central) {
    const productsWithoutStock = await prisma.product.findMany({
      where: {
        warehouseStocks: { none: { warehouseId: central.id } },
      },
      select: { id: true, stockQty: true },
      take: 200,
    });

    if (productsWithoutStock.length > 0) {
      for (const p of productsWithoutStock) {
        await prisma.warehouseStock.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: central.id,
              productId: p.id,
            },
          },
          create: {
            warehouseId: central.id,
            productId: p.id,
            quantity: p.stockQty,
            shelfLocation: "قفسه مرکزی A-01",
          },
          update: {},
        });
      }
    }
  }
}

export const TRANSFER_STATUS_MAP: Record<
  string,
  { label: string; badgeClass: string; step: number }
> = {
  DRAFT: {
    label: "پیش‌نویس حواله (در حال بارگیری)",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    step: 1,
  },
  IN_TRANSIT: {
    label: "در حال حمل بین‌شهری (خروج از مبدأ)",
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-300",
    step: 2,
  },
  RECEIVED: {
    label: "تخلیه و ورود به موجودی انبار مقصد",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
    step: 3,
  },
  CANCELLED: {
    label: "لغو شده",
    badgeClass: "bg-rose-500/10 text-rose-700 border-rose-300",
    step: 0,
  },
};
