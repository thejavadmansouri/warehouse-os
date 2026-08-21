import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  AckOrdersDto,
  PushStatusDto,
  SyncCatalogDto,
  SyncProductDto,
  SyncSettingsDto,
} from './dto/sync.dto';

/**
 * سمتِ **سایت** از سینک.
 *
 * این سرویس روی سرور اینترنتی اجرا می‌شود و فقط ایجنتِ انبار صدایش می‌زند.
 * هیچ‌جای این فایل به انبار وصل نمی‌شود — جهت ارتباط همیشه یک‌طرفه است:
 * انبار زنگ می‌زند، سایت جواب می‌دهد. سایت هیچ راهی برای رسیدن به انبار ندارد
 * و همین چیزی است که کلِ این معماری را امن می‌کند.
 */
@Injectable()
export class SyncService {
  private readonly log = new Logger('Sync');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * انبار و مکانِ مجازیِ سایت.
   *
   * جدول `Inventory` به یک `locationId` نیاز دارد چون در انبارِ واقعی موجودی
   * همیشه روی یک قفسه است. سایت قفسه ندارد، ولی اگر این ستون را دور بزنیم
   * باید `storefront-catalog.service` را هم عوض کنیم — و آن سرویس باید روی هر
   * دو طرف یکی بماند. پس یک مکانِ ساختگی می‌سازیم و همه‌ی موجودی سایت رویش
   * می‌نشیند.
   */
  private async siteLocationId(): Promise<string> {
    const existing = await this.prisma.location.findFirst({
      where: { code: 'SITE-STOCK' },
      select: { id: true },
    });
    if (existing) return existing.id;

    const warehouse =
      (await this.prisma.warehouse.findFirst({ select: { id: true } })) ??
      (await this.prisma.warehouse.create({
        data: { name: 'فروشگاه اینترنتی', code: 'SITE' },
        select: { id: true },
      }));

    // `Location` بدون نوع ساخته نمی‌شود، و نوع هم به انبار وصل است.
    const type =
      (await this.prisma.locationType.findFirst({
        where: { warehouseId: warehouse.id, depth: 0 },
        select: { id: true },
      })) ??
      (await this.prisma.locationType.create({
        data: { warehouseId: warehouse.id, name: 'سایت', depth: 0 },
        select: { id: true },
      }));

    const created = await this.prisma.location.create({
      data: {
        code: 'SITE-STOCK',
        name: 'موجودی سایت',
        // بارکد یکتاست و روی سایت هیچ‌وقت چاپ نمی‌شود؛ فقط باید وجود داشته باشد.
        barcode: 'SITE-STOCK',
        path: 'SITE-STOCK',
        depth: 0,
        typeId: type.id,
        warehouseId: warehouse.id,
      },
      select: { id: true },
    });
    return created.id;
  }

  /** نام → شناسه، با ساختِ خودکار. برند و دسته روی سایت فقط برچسب‌اند. */
  private async lookup(
    table: 'brand' | 'category' | 'vehicleModel',
    names: string[],
  ): Promise<Map<string, string>> {
    const clean = [...new Set(names.filter(Boolean))];
    const map = new Map<string, string>();
    if (!clean.length) return map;

    const model = this.prisma[table] as {
      findMany: (a: unknown) => Promise<{ id: string; name: string }[]>;
      create: (a: unknown) => Promise<{ id: string; name: string }>;
    };

    const found = await model.findMany({
      where: { name: { in: clean } },
      select: { id: true, name: true },
    });
    found.forEach((r) => map.set(r.name, r.id));

    for (const name of clean) {
      if (map.has(name)) continue;
      const row = await model.create({ data: { name }, select: { id: true, name: true } });
      map.set(name, row.id);
    }
    return map;
  }

  /**
   * نشاندنِ عکسِ کاتالوگ.
   *
   * ⚠️ کالایی که در عکس نیست **حذف نمی‌شود، فقط از سایت برداشته می‌شود**
   * (`showOnline=false`). حذفِ واقعی یعنی شکستنِ `OnlineOrderLine` که به همان
   * کالا اشاره دارد — یعنی نابودیِ سابقه‌ی سفارش‌های قبلیِ مشتری.
   */
  async applyCatalog(dto: SyncCatalogDto) {
    const locationId = await this.siteLocationId();

    const brands = await this.lookup('brand', dto.products.map((p) => p.brand ?? ''));
    const cats = await this.lookup('category', dto.products.map((p) => p.category ?? ''));
    const vehicles = await this.lookup(
      'vehicleModel',
      dto.products.flatMap((p) => p.vehicles),
    );

    for (const p of dto.products) {
      await this.upsertProduct(p, { locationId, brands, cats, vehicles });
    }

    const keep = dto.products.map((p) => p.id);
    const removed = await this.prisma.product.updateMany({
      where: { showOnline: true, id: { notIn: keep } },
      data: { showOnline: false },
    });

    await this.prisma.shopSettings.upsert({
      where: { id: 'singleton' },
      update: { storedUnit: dto.storedUnit },
      create: { id: 'singleton', storedUnit: dto.storedUnit },
    });

    this.log.log(`کاتالوگ سینک شد: ${dto.products.length} کالا، ${removed.count} برداشته‌شده`);
    return { received: dto.products.length, removed: removed.count };
  }

  private async upsertProduct(
    p: SyncProductDto,
    ctx: {
      locationId: string;
      brands: Map<string, string>;
      cats: Map<string, string>;
      vehicles: Map<string, string>;
    },
  ) {
    const base = {
      name: p.name,
      sku: p.sku,
      partNumber: p.partNumber ?? null,
      description: p.description ?? null,
      unit: p.unit,
      weight: p.weightGrams != null ? p.weightGrams / 1000 : null,
      brandId: p.brand ? ctx.brands.get(p.brand) ?? null : null,
      categoryId: p.category ? ctx.cats.get(p.category) ?? null : null,
      searchTokens: p.searchTokens,
      showOnline: true,
      isActive: true,
      deletedAt: null,
    };

    await this.prisma.product.upsert({
      where: { id: p.id },
      update: base,
      create: { id: p.id, ...base },
    });

    /*
     * قیمت: به‌جای انباشتنِ یک ردیفِ تازه در هر چرخه (هر ۲ دقیقه = ۷۲۰ ردیف در
     * روز برای هر کالا)، تنها ردیفِ سایت به‌روزرسانی می‌شود. تاریخچه‌ی قیمت
     * جای خودش در انبار است، نه اینجا.
     */
    const price = await this.prisma.productPrice.findFirst({
      where: { productId: p.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, salePrice: true },
    });

    if (!price) {
      await this.prisma.productPrice.create({
        data: { productId: p.id, salePrice: p.salePrice },
      });
    } else if (price.salePrice !== p.salePrice) {
      await this.prisma.productPrice.update({
        where: { id: price.id },
        data: { salePrice: p.salePrice },
      });
    }

    await this.prisma.inventory.upsert({
      where: { productId_locationId: { productId: p.id, locationId: ctx.locationId } },
      update: { quantity: p.quantity },
      create: { productId: p.id, locationId: ctx.locationId, quantity: p.quantity },
    });

    // سازگاری خودرو: ساده‌ترین کارِ درست، پاک‌کردن و نوشتنِ دوباره.
    await this.prisma.productVehicle.deleteMany({ where: { productId: p.id } });
    if (p.vehicles.length) {
      await this.prisma.productVehicle.createMany({
        data: p.vehicles
          .map((v) => ctx.vehicles.get(v))
          .filter((id): id is string => !!id)
          .map((vehicleModelId) => ({ productId: p.id, vehicleModelId })),
        skipDuplicates: true,
      });
    }
  }

  /** تنظیمات فروشگاه از انبار می‌آید تا مدیر همه‌چیز را یک‌جا عوض کند. */
  async applySettings(dto: SyncSettingsDto) {
    await this.prisma.shopSettings.upsert({
      where: { id: 'singleton' },
      update: dto,
      create: { id: 'singleton', ...dto },
    });
    return { ok: true };
  }

  /**
   * سفارش‌هایی که هنوز پایین نرفته‌اند.
   *
   * ملاک `pulledAt` است نه `status`: سفارشی که ایجنت گرفته ولی فروشنده هنوز
   * تصمیمی درباره‌اش نگرفته، نباید دوباره فرستاده شود.
   */
  async pendingOrders() {
    return this.prisma.onlineOrder.findMany({
      where: { pulledAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        number: true,
        subtotal: true,
        shippingFee: true,
        total: true,
        payMethod: true,
        receiverName: true,
        receiverPhone: true,
        address: true,
        note: true,
        createdAt: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phones: { where: { isPrimary: true }, select: { phone: true }, take: 1 },
          },
        },
        lines: {
          select: {
            productId: true,
            productName: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
      },
    });
  }

  /**
   * «گرفتمشان».
   *
   * ایجنت این را **بعد از** نوشتنِ موفقِ سفارش در دیتابیس انبار صدا می‌زند.
   * ترتیبش مهم است: اگر اول ack بزند و بعد نوشتن شکست بخورد، سفارش برای همیشه
   * گم می‌شود. این‌طور در بدترین حالت یک سفارش دوبار پایین می‌رود، که چون
   * شناسه‌اش یکی است بی‌ضرر است.
   */
  async ackOrders(dto: AckOrdersDto) {
    const done = await this.prisma.onlineOrder.updateMany({
      where: { id: { in: dto.ids }, pulledAt: null },
      data: { pulledAt: new Date() },
    });
    return { acked: done.count };
  }

  /** وضعیتی که فروشنده در پنلِ انبار تعیین کرده، برمی‌گردد روی سایت. */
  async applyStatuses(dto: PushStatusDto) {
    let updated = 0;
    for (const o of dto.orders) {
      const done = await this.prisma.onlineOrder.updateMany({
        where: { id: o.id },
        data: {
          status: o.status,
          rejectReason: o.rejectReason ?? null,
          decidedAt: new Date(),
        },
      });
      updated += done.count;
    }
    return { updated };
  }
}
