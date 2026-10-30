/*
 * کاردو B2B — لایه تجرید داده (Data Provider)
 *
 * اصل معماری: هیچ بخشی از منطق تجاری یا UI مستقیماً به دیتابیس داخلی انبار کاردو
 * وابسته نیست. ارتباط یا از طریق دیتابیس مستقل محلی (Prisma) است و یا از طریق
 * آداپتور REST با سرور Warehouse OS (پورت ۳۰۰۰).
 */

import { prisma } from "@/lib/prisma";

export interface StockAndPrice {
  sku: string;
  name: string;
  stockQty: number;
  price: number;
  isActive: boolean;
}

export interface B2BDataProvider {
  getProduct(sku: string): Promise<StockAndPrice | null>;
  checkStock(sku: string, requiredQty: number): Promise<{ available: boolean; currentStock: number }>;
  syncProductWithWarehouse(sku: string): Promise<StockAndPrice | null>;
  notifyOrderCreated(orderId: string, orderNumber: string, items: { sku: string; qty: number }[]): Promise<{ synced: boolean; message?: string }>;
}

/**
 * پیاده‌سازی ۱: دیتابیس محلی Prisma (حالت مستقل و پیش‌فرض)
 */
class LocalPrismaDataProvider implements B2BDataProvider {
  async getProduct(sku: string): Promise<StockAndPrice | null> {
    const p = await prisma.product.findUnique({ where: { sku } });
    if (!p) return null;
    return {
      sku: p.sku,
      name: p.name,
      stockQty: p.stockQty,
      price: Number(p.price),
      isActive: p.isActive,
    };
  }

  async checkStock(sku: string, requiredQty: number) {
    const p = await prisma.product.findUnique({ where: { sku } });
    if (!p) return { available: false, currentStock: 0 };
    return {
      available: p.stockQty >= requiredQty,
      currentStock: p.stockQty,
    };
  }

  async syncProductWithWarehouse(sku: string) {
    return this.getProduct(sku);
  }

  async notifyOrderCreated(orderId: string, orderNumber: string) {
    // در حالت محلی صرفاً لاگ می‌شود
    return { synced: true, message: `سفارش ${orderNumber} به انبار محلی ثبت شد` };
  }
}

/**
 * پیاده‌سازی ۲: آداپتور REST کاردو (Warehouse OS)
 * در صورتی که متغیر KARDO_API_URL در .env ست شده باشد، از این آداپتور استفاده می‌شود.
 * در صورت بروز قطعی شبکه یا خطای سرور انبار، با آرامش به دیتابیس محلی Fallback می‌کند.
 */
class KardoRestDataProvider implements B2BDataProvider {
  private baseUrl: string;
  private apiKey: string;
  private fallback: LocalPrismaDataProvider;

  constructor(baseUrl: string, apiKey = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fallback = new LocalPrismaDataProvider();
  }

  private async fetchKardo(path: string, options: RequestInit = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...(options.headers || {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getProduct(sku: string): Promise<StockAndPrice | null> {
    try {
      const res = await this.fetchKardo(`/api/b2b/parts/${encodeURIComponent(sku)}`);
      if (res.ok) {
        const data = await res.json();
        return {
          sku: data.sku,
          name: data.name,
          stockQty: data.stockQty ?? 0,
          price: Number(data.price ?? 0),
          isActive: data.isActive ?? true,
        };
      }
    } catch {
      // سرور کاردو در دسترس نیست؛ استفاده از دیتابیس محلی
    }
    return this.fallback.getProduct(sku);
  }

  async checkStock(sku: string, requiredQty: number) {
    try {
      const res = await this.fetchKardo(`/api/b2b/stock/check`, {
        method: "POST",
        body: JSON.stringify({ sku, qty: requiredQty }),
      });
      if (res.ok) {
        const data = await res.json();
        return { available: data.available, currentStock: data.currentStock };
      }
    } catch {
      // استفاده از داده محلی در صورت خطای شبکه
    }
    return this.fallback.checkStock(sku, requiredQty);
  }

  async syncProductWithWarehouse(sku: string): Promise<StockAndPrice | null> {
    try {
      const remote = await this.getProduct(sku);
      if (remote) {
        // به‌روزرسانی موجودی و قیمت در دیتابیس محلی کاردو B2B
        await prisma.product.update({
          where: { sku },
          data: {
            stockQty: remote.stockQty,
            price: remote.price,
            isActive: remote.isActive,
          },
        }).catch(() => {});
        return remote;
      }
    } catch {
      // چشم‌پوشی
    }
    return this.fallback.getProduct(sku);
  }

  async notifyOrderCreated(orderId: string, orderNumber: string, items: { sku: string; qty: number }[]) {
    try {
      const res = await this.fetchKardo(`/api/b2b/orders/notify`, {
        method: "POST",
        body: JSON.stringify({ orderId, orderNumber, items }),
      });
      if (res.ok) {
        return { synced: true, message: `سفارش در سامانه کاردو انبار ثبت شد` };
      }
    } catch {
      // ثبت آفلاین برای هماهنگی بعدی
    }
    return { synced: false, message: "انبار در دسترس نبود، سفارش محلی ثبت شد" };
  }
}

/** دریافت کلاینت data provider با توجه به متغیرهای محیطی */
export function getDataProvider(): B2BDataProvider {
  const kardoUrl = process.env.KARDO_API_URL;
  if (kardoUrl) {
    return new KardoRestDataProvider(kardoUrl, process.env.KARDO_API_KEY || "");
  }
  return new LocalPrismaDataProvider();
}
