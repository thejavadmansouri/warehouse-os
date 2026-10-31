export const instant = false;

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { CustomerShell } from "@/components/customer-shell";
import { AdminShell } from "@/components/admin/admin-shell";
import { walletBalance } from "@/lib/wallet";
import { priceLine } from "@/lib/pricing";
import { ProductDetailView } from "./product-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { name: true, sku: true, brand: true, category: true },
  });

  if (!product) return { title: "قطعه یافت نشد | کاردو B2B" };

  return {
    title: `${product.name} (${product.sku}) | کاردو B2B`,
    description: `خرید عمده ${product.name} ویژه ${product.brand} - دسته ${product.category} با تحویل مستقیم از انبار مرکزی کرمان.`,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isAdmin = session?.role === "admin";
  let customerInfo: any = null;
  let adminInfo: any = null;

  if (isAdmin) {
    adminInfo = await prisma.adminUser.findUnique({
      where: { id: session.sub },
      select: { id: true, username: true, name: true, role: true },
    });
  } else if (session) {
    const customer = await prisma.customer.findUnique({
      where: { id: session.sub, deletedAt: null },
      include: { tier: true },
    });

    if (customer) {
      const [wallet, openCreditAgg] = await Promise.all([
        walletBalance(customer.id),
        prisma.order.aggregate({
          where: { customerId: customer.id, status: "APPROVED_CREDIT" },
          _sum: { creditAmount: true },
        }),
      ]);

      const usedCredit = Number(openCreditAgg._sum.creditAmount ?? 0);
      const creditLimit = Number(customer.creditLimitOverride ?? customer.tier?.creditLimit ?? 0);
      const availableCredit = Math.max(0, creditLimit - usedCredit);
      const tierDiscount = Number(customer.tier?.baseDiscount ?? 0);
      const customerDiscount = Number(customer.discountPercent);

      customerInfo = {
        customer,
        wallet,
        usedCredit,
        creditLimit,
        availableCredit,
        tierDiscount,
        customerDiscount,
      };
    }
  }

  // واکشی کامل مشخصات محصول، پله‌های تخفیف و موجودی انبارها
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      volumePrices: { orderBy: { qtyFrom: "asc" } },
      warehouseStocks: { include: { warehouse: true } },
    },
  });

  if (!product || (!product.isActive && !isAdmin)) {
    notFound();
  }

  // واکشی قطعات مرتبط بر اساس برند خودرو یا دسته
  const relatedProducts = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      isActive: true,
      OR: [{ brand: product.brand }, { category: product.category }],
    },
    take: 4,
    orderBy: { stockQty: "desc" },
    select: {
      id: true,
      name: true,
      sku: true,
      brand: true,
      category: true,
      partBrand: true,
      price: true,
      stockQty: true,
      imageUrl: true,
      unit: true,
    },
  });

  // محاسبه قیمت همکاری بر اساس تخفیف مشتری (اگر وارد شده باشد)
  const tierDiscountPercent = customerInfo ? customerInfo.tierDiscount : 0;
  const customerDiscountPercent = customerInfo ? customerInfo.customerDiscount : 0;
  const priceModel = {
    price: Number(product.price),
    volumePrices: product.volumePrices.map((v) => ({
      qtyFrom: v.qtyFrom,
      discountPercent: Number(v.discountPercent),
    })),
  };

  const calculatedBasePrice = priceLine(priceModel, product.minQty, {
    tierDiscountPercent,
    customerDiscountPercent,
  });

  // محاسبه پله‌های تخفیف تیراژ
  const calculatedVolumeSteps = product.volumePrices.map((vp) => {
    const stepCalc = priceLine(priceModel, vp.qtyFrom, {
      tierDiscountPercent,
      customerDiscountPercent,
    });
    return {
      qtyFrom: vp.qtyFrom,
      discountPercent: Number(vp.discountPercent),
      effectiveUnitPrice: stepCalc.unitPrice,
      totalStepDiscount: stepCalc.discountPercent,
    };
  });

  // واکشی روش‌های ارسال برای سفارش مستقیم
  const shippingMethods = await prisma.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const productData = {
    id: product.id,
    sku: product.sku,
    oemCode: product.oemCode,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    brand: product.brand,
    model: product.model,
    category: product.category,
    partBrand: product.partBrand,
    unit: product.unit,
    packSize: product.packSize,
    minQty: product.minQty,
    stockQty: product.stockQty,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    basePrice: Number(product.price),
    customerUnitPrice: calculatedBasePrice.unitPrice,
    totalDiscountPercent: calculatedBasePrice.discountPercent,
    volumeSteps: calculatedVolumeSteps,
    warehouseStocks: product.warehouseStocks.map((ws) => ({
      warehouseName: ws.warehouse.name,
      city: ws.warehouse.city,
      qty: ws.quantity,
      reserved: ws.reservedQty,
      available: Math.max(0, ws.quantity - ws.reservedQty),
    })),
  };

  const canOrder = isAdmin || customerInfo?.customer.status === "ACTIVE";

  const content = (
    <ProductDetailView
      product={productData}
      isAdmin={isAdmin}
      canOrder={canOrder}
      wallet={customerInfo?.wallet ?? 0}
      availableCredit={customerInfo?.availableCredit ?? 0}
      shippingMethods={shippingMethods.map((s) => ({
        id: s.id,
        name: s.name,
        cost: Number(s.cost),
        note: s.note,
      }))}
      relatedProducts={relatedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        category: p.category,
        partBrand: p.partBrand,
        price: Number(p.price),
        stockQty: p.stockQty,
        imageUrl: p.imageUrl,
        unit: p.unit,
      }))}
    />
  );

  if (isAdmin && adminInfo) {
    return (
      <AdminShell admin={adminInfo}>
        <div className="max-w-6xl mx-auto px-4 py-6">{content}</div>
      </AdminShell>
    );
  }

  if (customerInfo) {
    return (
      <CustomerShell
        companyName={customerInfo.customer.companyName}
        contactName={customerInfo.customer.contactName}
        phone={customerInfo.customer.phone}
        tierName={customerInfo.customer.tier?.name}
        tierDiscount={customerInfo.tierDiscount}
        wallet={customerInfo.wallet}
        availableCredit={customerInfo.availableCredit}
        active="catalog"
      >
        <div className="max-w-6xl mx-auto px-4 py-6">{content}</div>
      </CustomerShell>
    );
  }

  // نمای مهمان برای کاربرانی که هنوز لاگین نکرده‌اند
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="size-9 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 text-slate-950 font-black text-lg flex items-center justify-center">
              ک
            </span>
            <div className="flex flex-col">
              <span className="font-black text-base text-slate-900 leading-tight">کاردو B2B</span>
              <span className="text-[10px] text-slate-400">انبار مرکزی کرمان</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/catalog" className="text-xs font-bold text-slate-700 hover:text-amber-600">
              کاتالوگ قطعات
            </Link>
            <Link
              href={`/login?next=/catalog/${id}`}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-xl transition shadow-xs"
            >
              ورود همکاران
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full">
        {content}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        سامانه توزیع و پخش قطعات یدکی خودرو کاردو دیار کریمان — انبار مرکزی کرمان
      </footer>
    </div>
  );
}
