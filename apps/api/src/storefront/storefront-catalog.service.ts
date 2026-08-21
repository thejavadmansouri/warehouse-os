import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { tokenizeQuery } from '../products/search-tokens';
import { convertMoney, CurrencyUnit } from '../common/money';

/**
 * کاتالوگ عمومی سایت.
 *
 * ⚠️ قاعده‌ی حاکم بر کل این فایل: هر `select` **صریح** است، هیچ‌جا آبجکت خام
 * محصول برنگردانده می‌شود. چیزهایی که هرگز نباید به اینترنت برسند:
 *   • `ProductPrice.purchasePrice` و `wholesalePrice` — قیمت خرید و عمده
 *   • `supplierId` / تأمین‌کننده
 *   • محل قفسه و `Inventory.locationId`
 *   • عددِ دقیقِ موجودی (رقیب نباید بداند چند تا داری)
 * یک `include` بی‌دقت اینجا یعنی لو رفتنِ حاشیه‌ی سود کلِ مغازه.
 */
const PAGE_MAX = 48;

/** فقط سه حالت به بیرون می‌رسد، نه عدد. */
function stockBand(qty: number): 'IN' | 'LOW' | 'OUT' {
  if (qty <= 0) return 'OUT';
  if (qty <= 3) return 'LOW';
  return 'IN';
}

export interface CatalogQuery {
  q?: string;
  categoryId?: string;
  brandId?: string;
  vehicleModelId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: 'newest' | 'cheapest' | 'expensive' | 'name';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class StorefrontCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * تنظیمات عمومی مغازه + کلید روشن/خاموشِ سایت.
   *
   * شماره کارت عمداً هست: خریدِ کارت‌به‌کارت بدون آن ممکن نیست. قیمت‌های
   * داخلی و نرخ چک بیرون می‌مانند.
   */
  async settings() {
    const s = await this.prisma.shopSettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });

    return {
      enabled: s.onlineEnabled,
      name: s.name,
      phone: s.phone,
      address: s.address,
      cardNumber: s.cardNumber,
      cardHolder: s.cardHolder,
      footer: s.footer,
      /*
       * مبالغِ بیرون‌رونده همه به واحدِ سایت‌اند، نه واحدِ دیتابیس. کلاینت
       * هیچ تبدیلی انجام نمی‌دهد — یک جای تبدیل یعنی یک جا برای اشتباه‌کردن.
       */
      shippingFee: convertMoney(s.shippingFee, s.storedUnit, s.siteUnit),
      freeShipOver: convertMoney(s.freeShipOver, s.storedUnit, s.siteUnit),
      /** برچسبی که کنار هر قیمت چاپ می‌شود. */
      unit: s.siteUnit,
      storedUnit: s.storedUnit,
    };
  }

  /**
   * سایت خاموش باشد یعنی هیچ endpointی داده نمی‌دهد.
   *
   * کلید در دست مدیر است نه در فایل تنظیمات سرور، چون کسی که باید سایت را
   * ببندد (مثلاً وسط انبارگردانی) به فایل تنظیمات دسترسی ندارد.
   */
  async assertOnline() {
    const s = await this.settings();
    if (!s.enabled) {
      throw new ForbiddenException({
        error: 'SHOP_OFFLINE',
        message: 'فروشگاه اینترنتی موقتاً غیرفعال است',
      });
    }
    return s;
  }

  /** شرطِ پایه‌ی «این کالا اجازه‌ی دیده‌شدن دارد». هیچ کوئری‌ای بدون این نیست. */
  private get visible(): Prisma.ProductWhereInput {
    return { showOnline: true, isActive: true, deletedAt: null };
  }

  async list(query: CatalogQuery) {
    const shop = await this.assertOnline();
    const units = { stored: shop.storedUnit, site: shop.unit };

    const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), PAGE_MAX);
    const page = Math.max(query.page ?? 1, 1);

    const where: Prisma.ProductWhereInput = { ...this.visible };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.vehicleModelId) {
      where.vehicles = { some: { vehicleModelId: query.vehicleModelId } };
    }

    /*
     * جستجو روی همان `searchTokens` ی که کل سیستم رویش سرچ می‌کند — هر کلمه
     * به‌صورت زیررشته، و همه‌ی کلمه‌ها باید بیایند («نت لو اید» → لنت جلو پراید).
     * ایندکس GIN اینجا استفاده نمی‌شود چون شرط `contains` است، ولی مجموعه‌ی
     * `showOnline` چند صد ردیف است نه ۳۳ هزار تا.
     */
    const tokens = tokenizeQuery(query.q ?? '');
    if (tokens.length) {
      // `has` تطبیقِ کاملِ توکن است و سریع؛ `contains` تایپِ ناقص را هم می‌گیرد
      // («نت» → لنت). هر دو لازم‌اند، و همه‌ی کلمه‌ها باید تطبیق کنند نه یکی.
      where.AND = tokens.map((t) => ({
        OR: [
          { searchTokens: { has: t } },
          { name: { contains: t, mode: 'insensitive' as const } },
        ],
      }));
    }

    const priced = await this.pricedIds(where, query, units);

    const total = priced.length;
    const slice = priced.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: await this.hydrate(slice),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * کالای بی‌قیمت روی سایت دیده نمی‌شود.
   *
   * قیمتِ «تماس بگیرید» برای فروشگاه اینترنتی یعنی سبد خرید بی‌معنا. مرتب‌سازی
   * و فیلترِ قیمت هم روی همین آخرین قیمت انجام می‌شود، نه روی ردیف‌های قدیمی.
   */
  private async pricedIds(
    where: Prisma.ProductWhereInput,
    query: CatalogQuery,
    units: { stored: CurrencyUnit; site: CurrencyUnit },
  ) {
    const rows = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        createdAt: true,
        prices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { salePrice: true },
        },
        inventories: { select: { quantity: true } },
      },
      // سقف سختِ ایمنی: حتی اگر مدیر روزی همه‌ی ۳۳ هزار کالا را آنلاین کند،
      // این endpoint حافظه‌ی سرور را نمی‌بلعد.
      take: 5_000,
    });

    /*
     * تبدیلِ واحد در **زودترین** نقطه انجام می‌شود: همین‌جا که قیمت از ردیف
     * بیرون کشیده می‌شود. از این خط به بعد هر عددِ پولی در این فایل به واحدِ
     * سایت است — فیلتر، مرتب‌سازی، جمعِ سبد و خروجی، همه روی یک واحد.
     *
     * اگر به‌جای این، تبدیل را به لبه‌ی خروجی موکول می‌کردیم، فیلترِ قیمتِ
     * کاربر (که به واحد سایت می‌آید) با قیمتِ ذخیره مقایسه می‌شد و «زیر ۵۰
     * هزار تومان» عملاً «زیر ۵۰ هزار ریال» معنا می‌داد.
     */
    const toSite = (v: number) => convertMoney(v, units.stored, units.site);

    let list = rows
      .map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        price: p.prices[0]?.salePrice != null ? toSite(p.prices[0].salePrice) : null,
        stock: p.inventories.reduce((s, i) => s + i.quantity, 0),
      }))
      .filter((p) => p.price !== null && p.price > 0);

    if (query.minPrice != null) list = list.filter((p) => p.price! >= query.minPrice!);
    if (query.maxPrice != null) list = list.filter((p) => p.price! <= query.maxPrice!);
    if (query.inStock) list = list.filter((p) => p.stock > 0);

    switch (query.sort) {
      case 'cheapest':
        list.sort((a, b) => a.price! - b.price!);
        break;
      case 'expensive':
        list.sort((a, b) => b.price! - a.price!);
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
        break;
      default:
        // موجود اول، بعد تازه‌ترین — کالایی که نیست نباید صدرِ صفحه‌ی اول باشد.
        list.sort(
          (a, b) =>
            Number(b.stock > 0) - Number(a.stock > 0) ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        );
    }

    return list;
  }

  private async hydrate(
    slice: { id: string; price: number | null; stock: number }[],
  ) {
    if (!slice.length) return [];

    const rows = await this.prisma.product.findMany({
      where: { id: { in: slice.map((s) => s.id) } },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        partNumber: true,
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        assets: {
          where: { type: 'PRODUCT_IMAGE' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { path: true, thumbnailPath: true },
        },
      },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));

    return slice
      .map((s) => {
        const p = byId.get(s.id);
        if (!p) return null;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          partNumber: p.partNumber,
          brand: p.brand?.name ?? null,
          brandId: p.brand?.id ?? null,
          category: p.category?.name ?? null,
          categoryId: p.category?.id ?? null,
          price: s.price,
          stock: stockBand(s.stock),
          image: p.assets[0]?.thumbnailPath ?? p.assets[0]?.path ?? null,
        };
      })
      .filter(Boolean);
  }

  async detail(id: string) {
    const shop = await this.assertOnline();

    const p = await this.prisma.product.findFirst({
      where: { id, ...this.visible },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        partNumber: true,
        description: true,
        weight: true,
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        vehicles: {
          select: { vehicleModel: { select: { id: true, name: true } } },
        },
        prices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { salePrice: true },
        },
        inventories: { select: { quantity: true } },
        assets: {
          where: { type: 'PRODUCT_IMAGE' },
          orderBy: { createdAt: 'asc' },
          select: { path: true, thumbnailPath: true },
        },
      },
    });

    // مثل `pricedIds`، تبدیل در همان لحظه‌ی استخراج — نه در لبه‌ی خروجی.
    const raw = p?.prices[0]?.salePrice ?? null;
    const price =
      raw != null ? convertMoney(raw, shop.storedUnit, shop.unit) : null;

    // کالای بی‌قیمت روی سایت اصلاً وجود ندارد — نه «موجود نیست»، بلکه ۴۰۴.
    if (!p || !price) {
      throw new NotFoundException({
        error: 'PRODUCT_NOT_FOUND',
        message: 'این کالا در فروشگاه اینترنتی موجود نیست',
      });
    }

    const stock = p.inventories.reduce((s, i) => s + i.quantity, 0);

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      partNumber: p.partNumber,
      description: p.description,
      weight: p.weight,
      brand: p.brand?.name ?? null,
      brandId: p.brand?.id ?? null,
      category: p.category?.name ?? null,
      categoryId: p.category?.id ?? null,
      vehicles: p.vehicles.map((v) => v.vehicleModel.name),
      price,
      stock: stockBand(stock),
      images: p.assets.map((a) => a.path),
    };
  }

  /** محصولات مرتبط: هم‌دسته، موجود، بدون خودش. */
  async related(id: string, limit = 6) {
    const shop = await this.assertOnline();

    const base = await this.prisma.product.findFirst({
      where: { id, ...this.visible },
      select: { categoryId: true, brandId: true },
    });
    if (!base) return [];

    const rows = await this.prisma.product.findMany({
      where: {
        ...this.visible,
        id: { not: id },
        OR: [
          ...(base.categoryId ? [{ categoryId: base.categoryId }] : []),
          ...(base.brandId ? [{ brandId: base.brandId }] : []),
        ],
      },
      select: { id: true, inventories: { select: { quantity: true } },
        prices: { orderBy: { createdAt: 'desc' }, take: 1, select: { salePrice: true } } },
      take: limit * 3,
    });

    const slice = rows
      .map((r) => ({
        id: r.id,
        price:
          r.prices[0]?.salePrice != null
            ? convertMoney(r.prices[0].salePrice, shop.storedUnit, shop.unit)
            : null,
        stock: r.inventories.reduce((s, i) => s + i.quantity, 0),
      }))
      .filter((r) => r.price && r.price > 0)
      .slice(0, limit);

    return this.hydrate(slice);
  }

  /**
   * دسته‌ها و برندهایی که **واقعاً کالای آنلاین دارند**.
   *
   * برگرداندن کل جدول دسته‌ها یعنی نوار فیلترِ پر از دسته‌هایی که کلیک‌شان
   * صفحه‌ی خالی می‌دهد.
   */
  async facets() {
    await this.assertOnline();

    const rows = await this.prisma.product.findMany({
      where: this.visible,
      select: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
      take: 5_000,
    });

    const cats = new Map<string, { id: string; name: string; count: number }>();
    const brands = new Map<string, { id: string; name: string; count: number }>();

    for (const r of rows) {
      if (r.category) {
        const c = cats.get(r.category.id) ?? { ...r.category, count: 0 };
        c.count++;
        cats.set(r.category.id, c);
      }
      if (r.brand) {
        const b = brands.get(r.brand.id) ?? { ...r.brand, count: 0 };
        b.count++;
        brands.set(r.brand.id, b);
      }
    }

    const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;

    return {
      categories: [...cats.values()].sort(byCount),
      brands: [...brands.values()].sort(byCount),
    };
  }
}
