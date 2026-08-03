import { Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { PrinterRenderService } from './printer-render.service';
import { isNumericSku } from '../products/sku.util';
import {
  buildThermalLabelHtml,
  buildSheetLabelHtml,
  buildProductSheetLabelHtml,
  LabelData,
  ProductLabelData,
  ProductSheetOptions,
} from './label-template';

@Injectable()
export class LabelsService {
  constructor(
    private prisma: PrismaService,
    private printer: PrinterRenderService,
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
  }) {
    await this.getSettings();
    return this.prisma.labelSettings.update({
      where: { id: 'singleton' },
      data: dto,
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
      barcode: isNumericSku(product.sku) ? product.sku : product.internalBarcode,
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

  async locationLabelPng(
    id: string,
    widthPx = 384,
  ): Promise<Buffer> {
    const label = await this.locationLabel(id);

    const html = buildThermalLabelHtml(
      label,
      widthPx,
    );

    return this.printer.renderPng(
      html,
      widthPx,
    );
  }

  async bulkLocationLabelsPng(
    ids: string[],
    widthPx = 384,
  ): Promise<Buffer[]> {
    const labels = await this.bulkLocationLabels(ids);

    const result: Buffer[] = [];

    for (const label of labels) {
      const html = buildThermalLabelHtml(
        label,
        widthPx,
      );

      result.push(
        await this.printer.renderPng(
          html,
          widthPx,
        ),
      );
    }

    return result;
  }

  async bulkLocationLabelsPdf(
    ids: string[],
    columns = 3,
  ): Promise<Buffer> {
    const labels = await this.bulkLocationLabels(ids);

    const html = buildSheetLabelHtml(
      labels,
      columns,
    );

    return this.printer.renderPdf(html);
  }


  // چاپ کل زیرمجموعه یک موقعیت
  async treeLocationLabelsPdf(
    rootId: string,
    columns = 3,
  ): Promise<Buffer> {

    const root =
      await this.prisma.location.findUnique({
        where: {
          id: rootId,
        },
      });


    if (!root) {
      throw new NotFoundException(
        'موقعیت پیدا نشد',
      );
    }


    const locations =
      await this.prisma.location.findMany({

        where: {
          OR: [
            {
              id: root.id,
            },
            {
              path: {
                startsWith:
                  root.path + ' > ',
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



    const labels =
      await Promise.all(
        locations.map((l) =>
          this.locationLabel(l.id),
        ),
      );



    const html =
      buildSheetLabelHtml(
        labels,
        columns,
      );


    return this.printer.renderPdf(
      html,
    );
  }
    async childrenLocationLabelsPdf(
    parentId: string,
    columns = 3,
  ): Promise<Buffer> {

    const parent =
      await this.prisma.location.findUnique({
        where: {
          id: parentId,
        },
      });


    if (!parent) {
      throw new NotFoundException(
        'موقعیت پیدا نشد',
      );
    }


    const children =
      await this.prisma.location.findMany({
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
      throw new NotFoundException(
        'زیرمجموعه‌ای برای چاپ وجود ندارد',
      );
    }


    const labels =
      await Promise.all(
        children.map((location) =>
          this.locationLabel(location.id),
        ),
      );


    const html =
      buildSheetLabelHtml(
        labels,
        columns,
      );


    return this.printer.renderPdf(html);
  }
  async rowShelvesLabelsPdf(
  rowId: string,
  columns = 3,
): Promise<Buffer> {

  const row =
    await this.prisma.location.findUnique({
      where: {
        id: rowId,
      },
    });


  if (!row) {
    throw new NotFoundException(
      'ردیف پیدا نشد',
    );
  }


  const shelves =
    await this.prisma.location.findMany({

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

    throw new NotFoundException(
      'برای این ردیف قفسه‌ای وجود ندارد',
    );

  }



  const labels =
    await Promise.all(
      shelves.map((s) =>
        this.locationLabel(s.id),
      ),
    );



  const html =
    buildSheetLabelHtml(
      labels,
      columns,
    );



  return this.printer.renderPdf(html);
}
  async filteredChildrenLabelsPdf(
    parentId: string,
    typeName: string,
    columns = 3,
  ): Promise<Buffer> {

    const parent =
      await this.prisma.location.findUnique({
        where: {
          id: parentId,
        },
      });


    if (!parent) {
      throw new NotFoundException(
        'موقعیت پیدا نشد',
      );
    }


    const locations =
      await this.prisma.location.findMany({

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
      throw new NotFoundException(
        `موردی با نوع ${typeName} پیدا نشد`,
      );
    }


    const labels =
      await Promise.all(
        locations.map((location) =>
          this.locationLabel(location.id),
        ),
      );


    const html =
      buildSheetLabelHtml(
        labels,
        columns,
      );


    return this.printer.renderPdf(html);
  }

  // چاپ لیبل محصول به‌تعداد (هر آیتم: کالا + quantity کپی) با تنظیمات چاپ.
  // بارکد = SKU (کد کوتاهِ حسابداری که فروشِ بارکدی هم با آن مطابقت می‌کند) نه
  // internalBarcode طولانی و بد-اسکن. کپی‌ها اینجا با quantity ساخته می‌شوند، پس
  // copies در options روی ۱ می‌ماند.
  async productLabelsPdf(
    items: { productId: string; quantity: number }[],
    opts: ProductSheetOptions = {},
  ): Promise<Buffer> {
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

    const html = buildProductSheetLabelHtml(labels, { ...opts, copies: 1 });
    return this.printer.renderPdf(html);
  }

  // چاپ لیبلِ «کل موجودیِ واردشده»: هر کالا به تعداد مجموع موجودی‌اش (جمعِ همه‌ی
  // مکان‌ها) — برای لیبل‌زدن یک‌جای هرچیزی که تا حالا شمرده/وارد شده.
  async stockLabelsPdf(opts: ProductSheetOptions = {}): Promise<Buffer> {
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
}