import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TsplService } from './tspl.service';
import { PrinterTransportService } from './printer-transport.service';
import { ProductImagesService } from '../product-images/product-images.service';
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
import { buildRollLocationPdf } from './roll-location-pdf';
import { shelfDisplayNumber } from './shelf-display-number';

@Injectable()
export class LabelsService {
  private readonly logger = new Logger(LabelsService.name);

  constructor(
    private prisma: PrismaService,
    private tspl: TsplService,
    private transport: PrinterTransportService,
    private productImages: ProductImagesService,
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

  /**
   * فهرست موقعیت‌های قابل‌چاپ زیر یک ریشه (خود + همهٔ فرزندان فعال).
   * برای UI «چاپ کامل / انتخابی» لیبل قفسه.
   */
  async listPrintableSubtree(rootId: string): Promise<
    Array<{
      id: string;
      name: string;
      code: string;
      path: string | null;
      typeName: string | null;
      shortNum: string;
      isRoot: boolean;
    }>
  > {
    const root = await this.prisma.location.findUnique({
      where: { id: rootId },
      select: {
        id: true,
        name: true,
        code: true,
        path: true,
        isActive: true,
        type: { select: { name: true } },
      },
    });
    if (!root || !root.isActive) {
      throw new NotFoundException('موقعیت پیدا نشد');
    }

    const pathPrefix = root.path ? `${root.path} > ` : null;
    const rows = await this.prisma.location.findMany({
      where: {
        isActive: true,
        OR: [
          { id: root.id },
          ...(pathPrefix
            ? [{ path: { startsWith: pathPrefix } }]
            : [{ parentId: root.id }]),
        ],
      },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        path: true,
        type: { select: { name: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      path: r.path,
      typeName: r.type?.name ?? null,
      shortNum: shelfDisplayNumber(r.name, r.code),
      isRoot: r.id === root.id,
    }));
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
      shortNum: shelfDisplayNumber(location.name, location.code),
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
  private printerTarget(
    settings: {
      printerName: string | null;
      printerHost: string | null;
      printerPort: number | null;
    },
    override?: { printerName?: string | null; printerHost?: string | null; printerPort?: number | null },
  ) {
    return {
      name: override?.printerName ?? settings.printerName,
      host: override?.printerHost ?? settings.printerHost,
      port: override?.printerPort ?? settings.printerPort ?? 9100,
    };
  }

  async listPrinters() {
    return this.transport.listSystemPrinters();
  }

  async printProductLabelsDirect(
    productIds: string[],
    copies = 1,
    printerOverride?: {
      printerName?: string | null;
      printerHost?: string | null;
      printerPort?: number | null;
    },
  ) {
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
      mediaWidthMm: settings.mediaWidthMm ?? 104,
    };
    const target = this.printerTarget(settings, printerOverride);
    if (!target.name && !target.host) {
      throw new BadRequestException({
        error: 'PRINTER_NOT_CONFIGURED',
        message:
          'پرینتر لیبل تنظیم نشده — در تنظیمات چاپ نام پرینتر یا IP شبکه را بزن',
      });
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, name: true, internalBarcode: true, sku: true },
    });

    let printed = 0;
    // همهٔ کالاها در «یک» payload — صف ستون‌بندی‌شده روی رول، مثل چیدمان قفسه.
    // ارسال تک‌به‌تک یعنی هر کالا یک استیکر و بقیهٔ عرض رول هدر می‌رفت.
    const items = products.map((p) => ({
      item: { barcode: p.sku || p.internalBarcode || '', name: p.name },
      copies,
    }));
    const payload = await this.tspl.buildProductRoll(items, size);
    await this.transport.send(payload, target);
    printed = products.length;

    // لیبل که چاپ شد، کالا از صف چاپ بیرون می‌رود.
    await this.prisma.product.updateMany({
      where: { id: { in: products.map((p) => p.id) } },
      data: { labelPrintedAt: new Date() },
    });

    // اگر عکس سایت + موجودی هم آماده باشد و autoPublish روشن باشد، صفحهٔ سایت روشن می‌شود.
    try {
      const shop = await this.prisma.shopSettings.findUnique({
        where: { id: 'singleton' },
        select: { autoPublishOnline: true },
      });
      if (shop?.autoPublishOnline) {
        for (const p of products) {
          try {
            await this.productImages.publishProductPage(p.id);
          } catch (err) {
            this.logger.warn(
              `publish site page after label failed for ${p.id}: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `autoPublish check after label failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return { printed, requested: productIds.length };
  }

  /** چاپ مستقیم لیبل قفسه (TSPL رول) روی پرینتر متصل به سرور / شبکه. */
  async printLocationLabelsDirect(
    ids: string[],
    printerOverride?: {
      printerName?: string | null;
      printerHost?: string | null;
      printerPort?: number | null;
    },
  ) {
    if (!ids.length) {
      throw new BadRequestException({
        error: 'NO_LOCATIONS',
        message: 'حداقل یک موقعیت باید انتخاب شود',
      });
    }
    const settings = await this.getSettings();
    const target = this.printerTarget(settings, printerOverride);
    if (!target.name && !target.host) {
      throw new BadRequestException({
        error: 'PRINTER_NOT_CONFIGURED',
        message:
          'پرینتر لیبل تنظیم نشده — در تنظیمات چاپ نام پرینتر یا IP شبکه را بزن',
      });
    }

    const labels = await this.bulkLocationLabels(ids);
    if (!labels.length) {
      throw new NotFoundException('موقعیتی برای چاپ پیدا نشد');
    }

    const payload = await this.tspl.buildLocationRoll(
      labels.map((l) => ({
        barcode: l.barcode,
        shortNum: l.shortNum || l.code,
      })),
      {
        widthMm: settings.widthMm,
        heightMm: settings.heightMm,
        gapMm: settings.gapMm,
        mediaWidthMm: settings.mediaWidthMm ?? 104,
      },
    );
    this.logger.log(
      `print-location-direct: labels=${labels.length} sticker=${settings.widthMm}x${settings.heightMm} media=${settings.mediaWidthMm ?? 104} cols=${Math.max(1, Math.floor((settings.mediaWidthMm ?? 104) / settings.widthMm))} feeds=${Math.ceil(labels.length / Math.max(1, Math.floor((settings.mediaWidthMm ?? 104) / settings.widthMm)))} target=${target.name ?? target.host ?? '?'}`,
    );
    await this.transport.send(payload, target);
    return { printed: labels.length, requested: ids.length };
  }

  async getSettings() {
    const existing = await this.prisma.labelSettings.findUnique({
      where: { id: 'singleton' },
    });
    if (!existing) {
      // رول مغازه همیشه ۱۰ سانتی است؛ برچسب پیش‌فرض ۳ تایی روی همان رول.
      return this.prisma.labelSettings.create({
        data: {
          id: 'singleton',
          mediaWidthMm: 104,
          widthMm: 34,
          heightMm: 25,
          gapMm: 2,
        },
      });
    }
    // عرض تکهٔ رول همیشه ۱۰۴mm (مثل 100200_big) — مقادیر قدیمی ۱۰۰/۱۰۵ هم نرمال می‌شوند.
    if (existing.mediaWidthMm == null || existing.mediaWidthMm !== 104) {
      return this.prisma.labelSettings.update({
        where: { id: 'singleton' },
        data: { mediaWidthMm: 104 },
      });
    }
    return existing;
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
    /** عرض فیزیکی رول — همیشه ۱۰۴mm (مثل 100200_big). */
    mediaWidthMm?: number | null;
    printerName?: string | null;
    printerHost?: string | null;
    printerPort?: number | null;
  }) {
    await this.getSettings();
    // خالی‌کردنِ متن هم باید کار کند؛ null → پاک‌کردنِ مقدار قبلی.
    const data: any = { ...dto, mediaWidthMm: 104 };
    if (data.footerText !== undefined) {
      data.footerText = data.footerText?.trim() ? data.footerText.trim() : null;
    }
    if (data.printerName !== undefined) {
      data.printerName = data.printerName?.trim() ? data.printerName.trim() : null;
    }
    if (data.printerHost !== undefined) {
      data.printerHost = data.printerHost?.trim() ? data.printerHost.trim() : null;
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
   * PDF واقعی رول قفسه (مثل 100200_big): MediaBox = عرض رول × ارتفاع برچسب،
   * QR + عدد Helvetica-Bold. HTML فقط برای پیش‌نمایش داخلی نگه داشته شده.
   */
  async rollLocationLabelsPdf(
    ids: string[],
    opts: RollLocationOptions,
  ): Promise<Buffer> {
    const labels = await this.bulkLocationLabels(ids);
    if (!labels.length) {
      throw new NotFoundException('موقعیتی برای چاپ لیبل پیدا نشد');
    }
    return buildRollLocationPdf(labels, {
      widthMm: opts.widthMm,
      heightMm: opts.heightMm,
      mediaWidthMm: opts.mediaWidthMm ?? 104,
    });
  }

  /** پیش‌نمایش HTML رول قفسه (تب مرورگر) — چاپ نهایی از PDF واقعی است. */
  async rollLocationLabelsHtmlPreview(
    ids: string[],
    opts: RollLocationOptions,
  ): Promise<string> {
    const labels = await this.bulkLocationLabels(ids);
    return buildRollLocationHtml(labels, {
      ...opts,
      mediaWidthMm: opts.mediaWidthMm ?? 104,
    });
  }
}
