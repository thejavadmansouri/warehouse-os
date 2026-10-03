import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TsplService } from './tspl.service';
import { PrinterTransportService } from './printer-transport.service';
import { isNumericSku } from '../products/sku.util';
import {
  buildThermalLabelHtml,
  buildSheetLabelHtml,
  buildHalfSheetLocationHtml,
  buildRollLabelHtml,
  type LabelPaper,
  buildProductSheetLabelHtml,
  LabelData,
  ProductLabelData,
  ProductSheetOptions,
  RollSheetOptions,
  RollLocationOptions,
  buildRollLocationHtml,
  type HalfSheetLocationOptions,
} from './label-template';

@Injectable()
export class LabelsService {
  constructor(
    private prisma: PrismaService,
    private tspl: TsplService,
    private transport: PrinterTransportService,
  ) {}

  private async qr(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      margin: 1,
      width: 300,
    });
  }

  private async buildLocationPath(location: any) {
    const path: { id: string; name: string }[] = [];

    let current = location;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current.id)) break;

      visited.add(current.id);

      path.unshift({
        id: current.id,
        name: current.name,
      });

      if (!current.parentId) break;

      current = await this.prisma.location.findUnique({
        where: {
          id: current.parentId,
        },
      });
    }

    return path;
  }

  async locationLabel(id: string): Promise<LabelData> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        warehouse: true,
      },
    });

    if (!location) {
      throw new NotFoundException('موقعیت پیدا نشد');
    }

    const path = await this.buildLocationPath(location);

    return {
      id: location.id,
      code: location.code,
      barcode: location.barcode,
      name: location.name,
      pathText: path.map((p) => p.name).join(' › '),
      warehouseName: location.warehouse?.name ?? null,
      qrCode: await this.qr(location.barcode),
    };
  }

  /** تنظیمات پیش‌فرض چاپ لیبل (تک‌ردیفی). */
  /**
   * چاپ مستقیم لیبل کالا روی پرینتر حرارتی.
   *
   * برخلاف مسیرهای PDF/PNG که خروجی را به مرورگر می‌دهند، این یکی خودش بایت
   * خام را به پرینتر می‌فرستد — چون پرینتر به همین سرور وصل است و مرورگر
   * نمی‌تواند بایت خام بفرستد.
   */
  async printProductLabelsDirect(productIds: string[], copies = 1) {
    if (!productIds.length) {
      throw new BadRequestException({
        error: 'NO_PRODUCTS',
        message: 'حداقل یک کالا باید انتخاب شود',
      });
    }

    const settings = await this.getSettings();
    const size = {
      widthMm: settings.widthMm,
      heightMm: settings.heightMm,
      gapMm: settings.gapMm,
    };
    const target = {
      name: settings.printerName,
      host: settings.printerHost,
      port: settings.printerPort,
    };

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, name: true, internalBarcode: true, sku: true },
    });

    let printed = 0;
    for (const p of products) {
      const payload = await this.tspl.buildProductLabel(
        { barcode: p.internalBarcode, name: p.name },
        size,
        copies,
      );
      await this.transport.send(payload, target);
      printed++;
    }

    // لیبل که چاپ شد، کالا از صف چاپ بیرون می‌رود.
    await this.prisma.product.updateMany({
      where: { id: { in: products.map((p) => p.id) } },
      data: { labelPrintedAt: new Date() },
    });

    return { printed, requested: productIds.length };
  }

  async getSettings() {
    const existing = await this.prisma.labelSettings.findUnique({
      where: { id: 'singleton' },
    });
    if (existing) return existing;
    return this.prisma.labelSettings.create({ data: { id: 'singleton' } });
  }

  async updateSettings(dto: {
    columns?: number;
    widthMm?: number;
    heightMm?: number;
    gapMm?: number;
    showName?: boolean;
    showBarcodeText?: boolean;
    cropMarks?: boolean;
    footerText?: string;
    /** عرض فیزیکی رول؛ بزرگ‌تر از widthMm = چند لیبل کنار هم. */
    mediaWidthMm?: number | null;
  }) {
    await this.getSettings();
    // خالی‌کردنِ متن هم باید کار کند؛ null → پاک‌کردنِ مقدار قبلی.
    const data: any = { ...dto };
    if (data.footerText !== undefined) {
      data.footerText = data.footerText?.trim() ? data.footerText.trim() : null;
    }
    return this.prisma.labelSettings.update({
      where: { id: 'singleton' },
      data,
    });
  }

  async productLabel(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        brand: true,
        vehicleModel: true,
      },
    });

    if (!product) {
      throw new NotFoundException('کالا پیدا نشد');
    }

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      brandName: product.brand?.name ?? null,
      vehicleModelName: product.vehicleModel?.name ?? null,
      // بارکد چاپی = کد حسابداری (SKU). قبلاً internalBarcode چاپ می‌شد که یک
      // UUID سی‌وشش‌کاراکتری است: روی لیبل قطعه جا نمی‌شود، کند خوانده می‌شود،
      // و اگر لیبل خط بخورد کسی نمی‌تواند دستی تایپش کند.
      // اگر کالا کد عددی نداشته باشد (کدهای موقت قدیمی)، به internalBarcode
      // برمی‌گردیم تا لیبل بدون بارکد چاپ نشود.
      barcode: isNumericSku(product.sku)
        ? product.sku
        : product.internalBarcode,
      qrCode: await this.qr(
        isNumericSku(product.sku) ? product.sku : product.internalBarcode,
      ),
    };
  }

  async bulkLocationLabels(ids: string[]) {
    return Promise.all(ids.map((id) => this.locationLabel(id)));
  }

  async bulkProductLabels(ids: string[]) {
    return Promise.all(ids.map((id) => this.productLabel(id)));
  }

  async bulkLocationLabelsPdf(
    ids: string[],
    columns?: number,
    paper: LabelPaper = 'A4',
  ): Promise<string> {
    const labels = await this.bulkLocationLabels(ids);

    const html = buildSheetLabelHtml(labels, columns, paper);

    return html;
  }

  /*
   * برگهٔ نیم‌برگ — هر لیبل دقیقاً نیمی از کاغذ (A5 → دو A6).
   * مسیرِ مستقل از دیالوگ؛ خروجی در تبِ نو باز می‌شود و اندازه کاغذ را رعایت
   * می‌کند، برخلاف چاپِ داخلِ ادمین که کاربر لیبلِ کوچک می‌گرفت.
   */
  async halfSheetLocationLabelsPdf(
    ids: string[],
    opts: HalfSheetLocationOptions = {},
  ): Promise<string> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('هیچ موقعیتی انتخاب نشده است');
    }
    const labels = await this.bulkLocationLabels(ids);
    return buildHalfSheetLocationHtml(labels, opts);
  }

  // چاپ کل زیرمجموعه یک موقعیت
  async treeLocationLabelsPdf(
    rootId: string,
    columns?: number,
    paper: LabelPaper = 'A4',
  ): Promise<string> {
    const root = await this.prisma.location.findUnique({
      where: {
        id: rootId,
      },
    });

    if (!root) {
      throw new NotFoundException('موقعیت پیدا نشد');
    }

    const locations = await this.prisma.location.findMany({
      where: {
        OR: [
          {
            id: root.id,
          },
          {
            path: {
              startsWith: root.path + ' > ',
            },
          },
        ],

        isActive: true,
      },

      orderBy: [
        {
          depth: 'asc',
        },

        {
          sortOrder: 'asc',
        },

        {
          name: 'asc',
        },
      ],
    });

    const labels = await Promise.all(
      locations.map((l) => this.locationLabel(l.id)),
    );

    const html = buildSheetLabelHtml(labels, columns, paper);

    return html;
  }
  async childrenLocationLabelsPdf(
    parentId: string,
    columns?: number,
    paper: LabelPaper = 'A4',
  ): Promise<string> {
    const parent = await this.prisma.location.findUnique({
      where: {
        id: parentId,
      },
    });

    if (!parent) {
      throw new NotFoundException('موقعیت پیدا نشد');
    }

    const children = await this.prisma.location.findMany({
      where: {
        parentId: parent.id,
        isActive: true,
      },

      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });

    if (children.length === 0) {
      throw new NotFoundException('زیرمجموعه‌ای برای چاپ وجود ندارد');
    }

    const labels = await Promise.all(
      children.map((location) => this.locationLabel(location.id)),
    );

    const html = buildSheetLabelHtml(labels, columns, paper);

    return html;
  }
  async rowShelvesLabelsPdf(
    rowId: string,
    columns?: number,
    paper: LabelPaper = 'A4',
  ): Promise<string> {
    const row = await this.prisma.location.findUnique({
      where: {
        id: rowId,
      },
    });

    if (!row) {
      throw new NotFoundException('ردیف پیدا نشد');
    }

    const shelves = await this.prisma.location.findMany({
      where: {
        parentId: row.id,

        type: {
          name: 'قفسه',
        },
      },

      orderBy: {
        code: 'asc',
      },
    });

    if (!shelves.length) {
      throw new NotFoundException('برای این ردیف قفسه‌ای وجود ندارد');
    }

    const labels = await Promise.all(
      shelves.map((s) => this.locationLabel(s.id)),
    );

    const html = buildSheetLabelHtml(labels, columns, paper);

    return html;
  }
  async filteredChildrenLabelsPdf(
    parentId: string,
    typeName: string,
    columns?: number,
    paper: LabelPaper = 'A4',
  ): Promise<string> {
    const parent = await this.prisma.location.findUnique({
      where: {
        id: parentId,
      },
    });

    if (!parent) {
      throw new NotFoundException('موقعیت پیدا نشد');
    }

    const locations = await this.prisma.location.findMany({
      where: {
        parentId: parent.id,

        isActive: true,

        type: {
          name: typeName,
        },
      },

      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          code: 'asc',
        },
      ],
    });

    if (!locations.length) {
      throw new NotFoundException(`موردی با نوع ${typeName} پیدا نشد`);
    }

    const labels = await Promise.all(
      locations.map((location) => this.locationLabel(location.id)),
    );

    const html = buildSheetLabelHtml(labels, columns, paper);

    return html;
  }

  // چاپ لیبل محصول به‌تعداد (هر آیتم: کالا + quantity کپی) با تنظیمات چاپ.
  // بارکد = SKU (کد کوتاهِ حسابداری که فروشِ بارکدی هم با آن مطابقت می‌کند) نه
  // internalBarcode طولانی و بد-اسکن. کپی‌ها اینجا با quantity ساخته می‌شوند، پس
  // copies در options روی ۱ می‌ماند.
  async productLabelsPdf(
    items: { productId: string; quantity: number }[],
    opts: ProductSheetOptions = {},
  ): Promise<string> {
    const ids = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, sku: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const labels: ProductLabelData[] = [];
    for (const item of items) {
      const p = byId.get(item.productId);
      if (!p) continue;
      const label: ProductLabelData = { name: p.name, barcode: p.sku };
      const copies = Math.max(1, Math.min(500, Math.floor(item.quantity) || 1));
      for (let i = 0; i < copies; i++) labels.push(label);
    }

    if (labels.length === 0) {
      throw new NotFoundException('محصولی برای چاپ لیبل پیدا نشد');
    }

    const html = buildProductSheetLabelHtml(labels, {
      ...opts,
      copies: 1,
      footerText: opts.footerText,
    });
    return html;
  }

  // چاپ لیبلِ «کل موجودیِ واردشده»: هر کالا به تعداد مجموع موجودی‌اش (جمعِ همه‌ی
  // مکان‌ها) — برای لیبل‌زدن یک‌جای هرچیزی که تا حالا شمرده/وارد شده.
  async stockLabelsPdf(opts: ProductSheetOptions = {}): Promise<string> {
    const grouped = await this.prisma.inventory.groupBy({
      by: ['productId'],
      where: { quantity: { gt: 0 } },
      _sum: { quantity: true },
    });
    const items = grouped.map((g) => ({
      productId: g.productId,
      quantity: g._sum.quantity ?? 0,
    }));
    return this.productLabelsPdf(items, opts);
  }

  /*
   * PDF رول حرارتی: هر صفحه = یک تکه‌ی رول (عرض رول × ارتفاع لیبل) با چند
   * لیبل کنار هم — دقیقاً همان چیزی که پرینتر حرارتی باید ببیند. پرینت با
   * Scale=100% و بدون هدر/فوتر.
   *
   * items خالی = «کل موجودیِ واردشده» (هر کالا به تعداد مجموع موجودی‌اش).
   */
  async rollLabelsPdf(
    items: { productId: string; quantity: number }[] | null,
    opts: RollSheetOptions,
  ): Promise<string> {
    let resolved = items;
    if (!resolved || resolved.length === 0) {
      const grouped = await this.prisma.inventory.groupBy({
        by: ['productId'],
        where: { quantity: { gt: 0 } },
        _sum: { quantity: true },
      });
      resolved = grouped.map((g) => ({
        productId: g.productId,
        quantity: g._sum.quantity ?? 0,
      }));
    }

    const ids = resolved.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, sku: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const labels: ProductLabelData[] = [];
    for (const item of resolved) {
      const p = byId.get(item.productId);
      if (!p) continue;
      const label: ProductLabelData = { name: p.name, barcode: p.sku };
      const copies = Math.max(1, Math.min(500, Math.floor(item.quantity) || 1));
      for (let i = 0; i < copies; i++) labels.push(label);
    }

    if (labels.length === 0) {
      throw new NotFoundException('محصولی برای چاپ لیبل پیدا نشد');
    }

    return buildRollLabelHtml(labels, opts);
  }

  /*
   * PDF رول حرارتیِ لیبلِ **موقعیت** (قفسه/ردیف/طبقه): هر صفحه = یک تکه‌ی رول
   * با چند لیبلِ کیوآر-محور کنار هم. هر لیبل: کیوآرِ بزرگ یک طرف (با موبایل
   * اسکن می‌شود و مستقیم روی همان قفسه می‌رود)، کدِ درشت و آدرسِ کامل طرفِ دیگر.
   */
  async rollLocationLabelsPdf(
    ids: string[],
    opts: RollLocationOptions,
  ): Promise<string> {
    const labels = await this.bulkLocationLabels(ids);
    return buildRollLocationHtml(labels, opts);
  }
}
