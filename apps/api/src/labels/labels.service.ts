import { Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { PrinterRenderService } from './printer-render.service';
import {
  buildThermalLabelHtml,
  buildSheetLabelHtml,
  LabelData,
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
      code: location.code,
      barcode: location.barcode,
      name: location.name,
      pathText: path.map((p) => p.name).join(' › '),
      warehouseName: location.warehouse?.name ?? null,
      qrCode: await this.qr(location.barcode),
    };
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
      barcode: product.internalBarcode,
      qrCode: await this.qr(product.internalBarcode),
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
}