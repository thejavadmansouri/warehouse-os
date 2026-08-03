import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';

import type { Response } from 'express';

import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';

import { LabelsService } from './labels.service';


@Controller('labels')
export class LabelsController {

  constructor(
    private readonly service: LabelsService,
  ) {}



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('location/:id')
  locationLabel(
    @Param('id') id: string,
  ) {
    return this.service.locationLabel(id);
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('product/:id')
  productLabel(
    @Param('id') id: string,
  ) {
    return this.service.productLabel(id);
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/bulk')
  bulkLocation(
    @Body() dto: { ids: string[] },
  ) {
    return this.service.bulkLocationLabels(dto.ids);
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('product/bulk')
  bulkProduct(
    @Body() dto: { ids: string[] },
  ) {
    return this.service.bulkProductLabels(dto.ids);
  }



  // چاپ تکی PNG
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('location/:id/print')
  async printLocationPng(
    @Param('id') id: string,
    @Query('width') width: string | undefined,
    @Res() res: Response,
  ) {

    const widthPx =
      width
        ? parseInt(width, 10)
        : 384;


    const buffer =
      await this.service.locationLabelPng(
        id,
        widthPx,
      );


    res.set({
      'Content-Type':
        'image/png',

      'Content-Disposition':
        `inline; filename="label-${id}.png"`,
    });


    res.send(buffer);
  }





  // چاپ لیبلِ کل موجودیِ واردشده (هر کالا به تعداد مجموع موجودی‌اش)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('stock/print')
  async printAllStockPdf(
    @Body()
    dto: {
      columns?: number;
      widthMm?: number;
      heightMm?: number;
      gapMm?: number;
      showName?: boolean;
      showBarcodeText?: boolean;
      cropMarks?: boolean;
    },
    @Res() res: Response,
  ) {
    const buffer = await this.service.stockLabelsPdf({
      columns: dto.columns,
      widthMm: dto.widthMm,
      heightMm: dto.heightMm,
      gapMm: dto.gapMm,
      showName: dto.showName,
      showBarcodeText: dto.showBarcodeText,
      cropMarks: dto.cropMarks,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="stock-labels.pdf"',
    });
    res.send(buffer);
  }

  // چاپ گروهی انتخابی PDF
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/bulk/print')
  async printLocationBulkPdf(
    @Body()
    dto: {
      ids: string[];
      columns?: number;
    },

    @Res() res: Response,
  ) {


    const buffer =
      await this.service.bulkLocationLabelsPdf(
        dto.ids,
        dto.columns ?? 3,
      );


    res.set({
      'Content-Type':
        'application/pdf',

      'Content-Disposition':
        'inline; filename="labels.pdf"',
    });


    res.send(buffer);
  }





  // تولید PNG گروهی
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/bulk/png')
  async bulkLocationPng(
    @Body()
    dto: {
      ids: string[];
    },

    @Res() res: Response,
  ) {


    const files =
      await this.service.bulkLocationLabelsPng(
        dto.ids,
      );


    res.json({
      count: files.length,
      message: 'labels generated',
    });
  }





  // چاپ فرزندان مستقیم یک موقعیت
  // مثال: طبقه -> ردیف ها
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/children/print')
  async printLocationChildrenPdf(
    @Body()
    dto: {
      locationId: string;
      columns?: number;
    },

    @Res() res: Response,
  ) {


    const buffer =
      await this.service.childrenLocationLabelsPdf(
        dto.locationId,
        dto.columns ?? 3,
      );


    res.set({
      'Content-Type':
        'application/pdf',

      'Content-Disposition':
        'inline; filename="location-children-labels.pdf"',
    });


    res.send(buffer);
  }





  // چاپ کل زیرشاخه
  // مثال: طبقه -> ردیف -> قفسه -> باکس
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/tree/print')
  async printLocationTreePdf(
    @Body()
    dto: {
      locationId: string;
      columns?: number;
    },

    @Res() res: Response,
  ) {


    const buffer =
      await this.service.treeLocationLabelsPdf(
        dto.locationId,
        dto.columns ?? 3,
      );


    res.set({
      'Content-Type':
        'application/pdf',

      'Content-Disposition':
        'inline; filename="location-tree-labels.pdf"',
    });


    res.send(buffer);
  }





  // چاپ فقط قفسه‌های یک ردیف
  // مثال: ردیف 3 -> قفسه 1، قفسه 2، ...
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/row/print')
  async printRowShelvesPdf(
    @Body()
    dto: {
      rowId: string;
      columns?: number;
    },

    @Res() res: Response,
  ) {


    const buffer =
      await this.service.rowShelvesLabelsPdf(
        dto.rowId,
        dto.columns ?? 3,
      );


    res.set({
      'Content-Type':
        'application/pdf',

      'Content-Disposition':
        'inline; filename="row-shelves-labels.pdf"',
    });


    res.send(buffer);
  }
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/filter/print')
  async printFilteredLocationPdf(
    @Body()
    dto: {
      parentId: string;
      type: string;
      columns?: number;
    },

    @Res() res: Response,
  ) {


    const buffer =
      await this.service.filteredChildrenLabelsPdf(
        dto.parentId,
        dto.type,
        dto.columns ?? 3,
      );


    res.set({
      'Content-Type':
        'application/pdf',

      'Content-Disposition':
        'inline; filename="filtered-location-labels.pdf"',
    });


    res.send(buffer);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('product/print')
  async printProductLabelsPdf(
    @Body()
    dto: {
      items: { productId: string; quantity: number }[];
      columns?: number;
      widthMm?: number;
      heightMm?: number;
      gapMm?: number;
      showName?: boolean;
      showBarcodeText?: boolean;
      cropMarks?: boolean;
    },
    @Res() res: Response,
  ) {
    const buffer = await this.service.productLabelsPdf(dto.items ?? [], {
      columns: dto.columns,
      widthMm: dto.widthMm,
      heightMm: dto.heightMm,
      gapMm: dto.gapMm,
      showName: dto.showName,
      showBarcodeText: dto.showBarcodeText,
      cropMarks: dto.cropMarks,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="product-labels.pdf"',
    });

    res.send(buffer);
  }
}