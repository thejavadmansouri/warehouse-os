import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnlineOrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { convertMoney } from '../common/money';
import { EventsGateway } from '../realtime/events.gateway';
import { normalizePhone } from '../common/phone.util';

/**
 * سمتِ **انبار** از سینک.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * قاعده‌ای که کلِ امنیتِ این معماری رویش سوار است:
 *
 *   این فایل تنها چیزی است که انبار و اینترنت را به هم وصل می‌کند، و **همیشه
 *   خودش تماس می‌گیرد**. سرور انبار هیچ پورتی به بیرون باز نمی‌کند، هیچ
 *   port-forward و هیچ تونلی لازم ندارد. فقط اتصالِ خروجیِ HTTPS.
 *
 *   یعنی حتی اگر سایت کاملاً هک شود، مهاجم هیچ راهی به انبار ندارد — چون هیچ
 *   دری وجود ندارد که بشود زد.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class SyncAgentService {
  private readonly log = new Logger('SyncAgent');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly sales: SalesService,
  ) {}

  private get siteUrl(): string {
    return (process.env.SITE_URL ?? '').replace(/\/$/, '');
  }
  private get secret(): string {
    return (process.env.SYNC_SECRET ?? '').trim();
  }
  get configured(): boolean {
    return !!this.siteUrl && this.secret.length >= 32;
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.siteUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': this.secret },
      body: body === undefined ? undefined : JSON.stringify(body),
      // قطعیِ نیمه‌باز نباید چرخه‌ی بعدی را هم بگیرد.
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /**
   * هر دو دقیقه.
   *
   * ترتیب عمداً این است: اول سفارش‌ها پایین می‌آیند (کارِ فوری، مشتری منتظر
   * است)، بعد وضعیت‌ها بالا می‌روند، و آخر کاتالوگ که سنگین‌ترین و
   * کم‌فوریت‌ترین است. اگر چرخه وسطِ کار بمیرد، مهم‌ترین کار قبلاً انجام شده.
   */
  @Cron('0 */2 * * * *')
  async tick() {
    if (!this.configured || this.running) return;
    this.running = true;
    try {
      await this.pullOrders();
      await this.pushStatuses();
      await this.pushCatalog();
    } catch (e) {
      /*
       * قطعیِ اینترنت یک خطای عادی است، نه فاجعه: چرخه‌ی بعدی دوباره تلاش
       * می‌کند و چون کاتالوگ «عکسِ کامل» است، هیچ چیزی جا نمی‌ماند.
       */
      this.log.warn(`سینک ناموفق بود: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // ─────────────────────────── کاتالوگ (بالا) ───────────────────────────

  async pushCatalog() {
    const shop = await this.prisma.shopSettings.findUnique({
      where: { id: 'singleton' },
    });

    const rows = await this.prisma.product.findMany({
      where: { showOnline: true, isActive: true, deletedAt: null },
      take: 5_000,
      select: {
        id: true, name: true, sku: true, partNumber: true, description: true,
        unit: true, weight: true, searchTokens: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
        vehicles: { select: { vehicleModel: { select: { name: true } } } },
        prices: { orderBy: { createdAt: 'desc' }, take: 1, select: { salePrice: true } },
        inventories: { select: { quantity: true } },
        assets: {
          where: { type: 'PRODUCT_IMAGE' },
          orderBy: { createdAt: 'asc' },
          select: { path: true },
        },
      },
    });

    const products = rows
      // کالای بی‌قیمت روی سایت معنا ندارد؛ همان‌جا هم فیلتر می‌شود، اینجا هم.
      .filter((p) => (p.prices[0]?.salePrice ?? 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        partNumber: p.partNumber,
        description: p.description,
        unit: p.unit,
        // گرم صحیح است؛ اعشارِ کیلوگرم بین دو دیتابیس گرد می‌شود و درمی‌رود.
        weightGrams: p.weight != null ? Math.round(p.weight * 1000) : null,
        brand: p.brand?.name ?? null,
        category: p.category?.name ?? null,
        vehicles: p.vehicles.map((v) => v.vehicleModel.name),
        salePrice: p.prices[0]!.salePrice!,
        quantity: p.inventories.reduce((s, i) => s + i.quantity, 0),
        images: p.assets.map((a) => a.path),
        searchTokens: p.searchTokens,
      }));

    await this.call('/sync/catalog', {
      products,
      storedUnit: shop?.storedUnit ?? 'RIAL',
    });

    if (shop) {
      await this.call('/sync/settings', {
        onlineEnabled: shop.onlineEnabled,
        shippingFee: shop.shippingFee,
        freeShipOver: shop.freeShipOver,
        name: shop.name,
        phone: shop.phone,
        address: shop.address,
        cardNumber: shop.cardNumber,
        cardHolder: shop.cardHolder,
      });
    }

    this.log.log(`کاتالوگ فرستاده شد: ${products.length} کالا`);
  }

  // ─────────────────────────── سفارش‌ها (پایین) ───────────────────────────

  async pullOrders() {
    type RemoteOrder = {
      id: string; number: number; subtotal: number; shippingFee: number;
      total: number; payMethod: string; receiverName: string; receiverPhone: string;
      address: string; note: string | null; createdAt: string;
      siteCustomer: { id: string; firstName: string; lastName: string | null; phone: string };
      lines: { productId: string; productName: string; unit: string;
               quantity: number; unitPrice: number; lineTotal: number }[];
    };

    const remote = await this.call<RemoteOrder[]>('/sync/orders');
    if (!remote.length) return;

    const warehouse = await this.prisma.warehouse.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!warehouse) {
      this.log.error('انباری تعریف نشده — سفارش‌های سایت پایین نمی‌آیند');
      return;
    }

    const landed: string[] = [];

    for (const o of remote) {
      try {
        await this.landOrder(o, warehouse.id);
        landed.push(o.id);
      } catch (e) {
        // یک سفارشِ خراب نباید جلوی بقیه را بگیرد؛ چرخه‌ی بعد دوباره می‌آید.
        this.log.error(`سفارش ${o.number} ننشست: ${(e as Error).message}`);
      }
    }

    /*
     * ack **بعد از** نوشتن. اگر برعکس بود و نوشتن شکست می‌خورد، سفارش برای
     * همیشه گم می‌شد. این‌طور بدترین حالت این است که یک سفارش دوبار پایین
     * بیاید — و چون با همان شناسه upsert می‌شود، بی‌ضرر است.
     */
    if (landed.length) {
      await this.call('/sync/orders/ack', { ids: landed });
      this.events.broadcast({ type: 'online-order.created', warehouseId: warehouse.id });
      this.log.log(`${landed.length} سفارش از سایت پایین آمد`);
    }
  }

  /**
   * نشاندنِ یک سفارشِ سایت در دیتابیس انبار — **و صدور فاکتورش**.
   *
   * فاکتور همین‌جا و خودکار صادر می‌شود، چون سفارش پیش از این قطعی شده: مشتری
   * ساعت ۴ صبح خرید کرده و منتظر کسی نمانده. فروشنده صبح فقط جنس را جمع
   * می‌کند. اگر صدور فاکتور شکست بخورد، سفارش باز هم می‌نشیند (بدون فاکتور) تا
   * فروشنده دستی رسیدگی کند — گم‌شدنِ سفارش بدترین حالتِ ممکن است.
   */
  private async landOrder(
    o: {
      id: string; number: number; subtotal: number; shippingFee: number; total: number;
      payMethod: string; receiverName: string; receiverPhone: string; address: string;
      note: string | null; createdAt: string;
      siteCustomer: { id: string; firstName: string; lastName: string | null; phone: string };
      lines: { productId: string; productName: string; unit: string;
               quantity: number; unitPrice: number; lineTotal: number }[];
    },
    warehouseId: string,
  ) {
    const existing = await this.prisma.onlineOrder.findUnique({
      where: { id: o.id },
      select: { id: true },
    });
    if (existing) return; // قبلاً نشسته — ackِ دوباره کافی است

    const phone = normalizePhone(o.siteCustomer.phone) ?? o.receiverPhone;

    /*
     * مشتریِ سایت **در جدول خودش** می‌نشیند، نه در `Customer` مغازه.
     * فهرست مشتریان مغازه نباید پر شود از کسانی که فقط یک بار از سایت خریده‌اند.
     */
    await this.prisma.siteCustomer.upsert({
      where: { id: o.siteCustomer.id },
      update: {
        firstName: o.siteCustomer.firstName,
        lastName: o.siteCustomer.lastName,
      },
      create: {
        id: o.siteCustomer.id,
        phone,
        firstName: o.siteCustomer.firstName,
        lastName: o.siteCustomer.lastName,
      },
    });

    /*
     * ردیفی که کالایش در انبار نیست کنار گذاشته می‌شود نه اینکه کلِ سفارش رد
     * شود — نام و قیمت روی خودِ ردیف کپی شده‌اند، پس فروشنده باز هم می‌بیند
     * مشتری چه خواسته.
     */
    const known = await this.prisma.product.findMany({
      where: { id: { in: o.lines.map((l) => l.productId) } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((k) => k.id));
    const lines = o.lines.filter((l) => knownIds.has(l.productId));

    if (lines.length !== o.lines.length) {
      this.log.warn(
        `سفارش ${o.number}: ${o.lines.length - lines.length} ردیف کالای ناشناس داشت`,
      );
    }

    await this.prisma.onlineOrder.create({
      data: {
        id: o.id,
        number: o.number,
        siteCustomerId: o.siteCustomer.id,
        warehouseId,
        status: OnlineOrderStatus.PLACED,
        subtotal: o.subtotal,
        shippingFee: o.shippingFee,
        total: o.total,
        payMethod: o.payMethod as Prisma.OnlineOrderCreateInput['payMethod'],
        receiverName: o.receiverName,
        receiverPhone: phone,
        address: o.address,
        note: o.note,
        createdAt: new Date(o.createdAt),
        lines: { create: lines },
      },
    });

    if (lines.length) await this.invoiceOrder(o.id, warehouseId);
  }

  /**
   * صدور فاکتورِ یک سفارشِ نشسته.
   *
   * سه نکته که اگر رعایت نشوند خرابی مالی می‌سازند:
   *
   *   ۱. **واحد پول برمی‌گردد.** ردیف‌های سفارش به واحدِ *سایت*‌اند (همان
   *      عددی که مشتری دید)، ولی `SaleInvoice` به واحدِ *دیتابیس* است.
   *   ۲. **کلیدِ تکرارناپذیری از شناسه‌ی سفارش ساخته می‌شود**، پس اجرای دوباره
   *      فاکتور دوم نمی‌سازد.
   *   ۳. **پرداختی ثبت نمی‌شود** — پول هنوز نیامده (پرداخت در محل). فروشنده
   *      از مسیر عادیِ رسید دریافتش می‌کند.
   */
  private async invoiceOrder(orderId: string, warehouseId: string) {
    const order = await this.prisma.onlineOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true, number: true, note: true, receiverName: true, receiverPhone: true,
        siteCustomer: { select: { firstName: true, lastName: true, phone: true } },
        lines: { select: { productId: true, quantity: true, unitPrice: true } },
      },
    });
    if (!order || !order.lines.length) return;

    const shop = await this.prisma.shopSettings.findUnique({
      where: { id: 'singleton' },
      select: { storedUnit: true, siteUnit: true },
    });
    const storedUnit = shop?.storedUnit ?? 'RIAL';
    const siteUnit = shop?.siteUnit ?? 'TOMAN';

    try {
      /*
       * مشتریِ مغازه فقط **همین‌جا** ساخته می‌شود — لحظه‌ای که فروش واقعی
       * ثبت می‌شود. اگر همان شماره از قبل مشتریِ حضوری باشد، به همان پرونده
       * می‌چسبد و سابقه‌اش یکی می‌ماند.
       */
      const found = await this.prisma.customerPhone.findUnique({
        where: { phone: order.siteCustomer.phone },
        select: { customerId: true },
      });

      const customerId =
        found?.customerId ??
        (
          await this.prisma.customer.create({
            data: {
              firstName: order.siteCustomer.firstName || 'مشتری سایت',
              lastName: order.siteCustomer.lastName,
              searchName: [order.siteCustomer.firstName, order.siteCustomer.lastName]
                .filter(Boolean)
                .join(' '),
              phones: {
                create: { phone: order.siteCustomer.phone, isPrimary: true, label: 'موبایل' },
              },
            },
            select: { id: true },
          })
        ).id;

      const invoice = await this.sales.createInvoice(
        {
          idempotencyKey: `online-order:${order.id}`,
          warehouseId,
          customerId,
          note: `سفارش سایت #${order.number}${order.note ? ` — ${order.note}` : ''}`,
          lines: order.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: convertMoney(l.unitPrice, siteUnit, storedUnit),
          })),
        },
        undefined,
      );

      await this.prisma.onlineOrder.update({
        where: { id: order.id },
        data: {
          customerId,
          invoiceId: (invoice as { id: string }).id,
          // به سایت خبر می‌دهد رزروِ موجودی را بردارد.
          stockAppliedAt: new Date(),
          syncedAt: null,
        },
      });
    } catch (e) {
      /*
       * سفارش نشسته و گم نشده؛ فقط فاکتور ندارد. فروشنده در صف می‌بیندش
       * (`invoiceId = null`) و دستی رسیدگی می‌کند.
       */
      this.log.error(
        `فاکتور سفارش ${order.number} صادر نشد: ${(e as Error).message}`,
      );
    }
  }

  // ─────────────────────────── وضعیت‌ها (بالا) ───────────────────────────

  /**
   * تصمیمِ فروشنده برمی‌گردد روی سایت.
   *
   * ملاک `syncedAt` است: سفارشی که تصمیمش قبلاً بالا رفته دوباره فرستاده
   * نمی‌شود، وگرنه هر چرخه همه‌ی تاریخچه را دوباره می‌فرستادیم.
   */
  async pushStatuses() {
    const rows = await this.prisma.onlineOrder.findMany({
      // هر وضعیتی که هنوز بالا نرفته — شاملِ خودِ PLACED نمی‌شود چون سایت
      // خودش آن را ساخته و می‌داند.
      where: { syncedAt: null, status: { not: OnlineOrderStatus.PLACED } },
      take: 200,
      select: { id: true, status: true, rejectReason: true, stockAppliedAt: true },
    });
    if (!rows.length) return;

    await this.call('/sync/orders/status', {
      orders: rows.map((r) => ({
        id: r.id,
        status: r.status,
        rejectReason: r.rejectReason,
        stockApplied: r.stockAppliedAt != null,
      })),
    });

    await this.prisma.onlineOrder.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { syncedAt: new Date() },
    });
    this.log.log(`${rows.length} وضعیت به سایت فرستاده شد`);
  }
}
