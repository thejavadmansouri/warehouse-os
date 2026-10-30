import { priceLine } from "@/lib/pricing";

/*
 * نگاشت محصولات DB به شکل کاتالوگ — یک منبع برای API و رندر اولیه‌ی صفحه.
 * قیمت فقط وقتی priceVisible است محاسبه می‌شود (مشتری ACTIVE).
 */
export type CatalogSourceProduct = {
  id: string;
  sku: string;
  oemCode: string | null;
  name: string;
  brand: string;
  model: string | null;
  category: string;
  partBrand: string | null;
  unit: string;
  packSize: number;
  minQty: number;
  stockQty: number;
  imageUrl: string | null;
  createdAt: Date;
  price: unknown; // Prisma.Decimal
  volumePrices: { qtyFrom: number; discountPercent: unknown }[];
};

export type CatalogItem = {
  id: string;
  sku: string;
  oemCode: string | null;
  name: string;
  brand: string;
  model: string | null;
  category: string;
  partBrand: string | null;
  unit: string;
  packSize: number;
  minQty: number;
  stockQty: number;
  imageUrl: string | null;
  createdAt: string;
  price: number | null;
  priceBefore: number | null;
  discountPercent: number | null;
  volumePrices: { qtyFrom: number; discountPercent: number }[];
};

export function mapCatalog(
  products: CatalogSourceProduct[],
  ctx: { tierDiscountPercent: number; customerDiscountPercent: number },
  priceVisible: boolean,
): CatalogItem[] {
  return products.map((p) => {
    const model = {
      price: Number(p.price),
      volumePrices: p.volumePrices.map((v) => ({
        qtyFrom: v.qtyFrom,
        discountPercent: Number(v.discountPercent),
      })),
    };

    const single = priceVisible ? priceLine(model, p.minQty, ctx) : null;

    return {
      id: p.id,
      sku: p.sku,
      oemCode: p.oemCode,
      name: p.name,
      brand: p.brand,
      model: p.model,
      category: p.category,
      partBrand: p.partBrand ?? null,
      unit: p.unit,
      packSize: p.packSize,
      minQty: p.minQty,
      stockQty: p.stockQty,
      imageUrl: p.imageUrl,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      price: single ? single.unitPrice : null,
      priceBefore: priceVisible ? Number(p.price) : null,
      discountPercent: single ? single.discountPercent : null,
      volumePrices: model.volumePrices,
    };
  });
}
