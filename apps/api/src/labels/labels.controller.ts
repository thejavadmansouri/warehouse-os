import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';

import type { Response } from 'express';

import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';

import { LabelsService } from './labels.service';
import { ProductsService } from '../products/products.service';


@Controller('labels')
export class LabelsController {

  constructor(
    private readonly service: LabelsService,
    private readonly products: ProductsService,
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
    const html = await this.service.stockLabelsPdf({
      columns: dto.columns,
      widthMm: dto.widthMm,
      heightMm: dto.heightMm,
      gapMm: dto.gapMm,
      showName: dto.showName,
      showBarcodeText: dto.showBarcodeText,
      cropMarks: dto.cropMarks,
    });
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
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


    const html =
      await this.service.bulkLocationLabelsPdf(
        dto.ids,
        dto.columns ?? 3,
      );


    res.set({ 'Content-Type': 'text/html; charset=utf-8' });


    res.send(html);
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


    const html =
      await this.service.childrenLocationLabelsPdf(
        dto.locationId,
        dto.columns ?? 3,
      );


    res.set({ 'Content-Type': 'text/html; charset=utf-8' });


    res.send(html);
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


    const html =
      await this.service.treeLocationLabelsPdf(
        dto.locationId,
        dto.columns ?? 3,
      );


    res.set({ 'Content-Type': 'text/html; charset=utf-8' });


    res.send(html);
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


    const html =
      await this.service.rowShelvesLabelsPdf(
        dto.rowId,
        dto.columns ?? 3,
      );


    res.set({ 'Content-Type': 'text/html; charset=utf-8' });


    res.send(html);
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


    const html =
      await this.service.filteredChildrenLabelsPdf(
        dto.parentId,
        dto.type,
        dto.columns ?? 3,
      );


    res.set({ 'Content-Type': 'text/html; charset=utf-8' });


    res.send(html);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  /** چاپ مستقیم لیبل کالا روی پرینتر حرارتیِ وصل به همین سرور. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('product/print-direct')
  printProductDirect(
    @Body() dto: { productIds: string[]; copies?: number },
  ) {
    return this.service.printProductLabelsDirect(
      dto?.productIds ?? [],
      dto?.copies ?? 1,
    );
  }


  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }


  @Put('settings')
  updateSettings(
    @Body() dto: {
      columns?: number;
      widthMm?: number;
      heightMm?: number;
      gapMm?: number;
      showName?: boolean;
      showBarcodeText?: boolean;
      cropMarks?: boolean;
    },
  ){
    return this.service.updateSettings(dto);
  }


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
    // هر مقداری که کلاینت نفرستاده از تنظیمات ذخیره‌شده‌ی مدیر پر می‌شود،
    // تا لازم نباشد هر بار ابعاد لیبل دوباره انتخاب شود.
    const saved = await this.service.getSettings();

    const html = await this.service.productLabelsPdf(dto.items ?? [], {
      columns: dto.columns ?? saved.columns,
      widthMm: dto.widthMm ?? saved.widthMm,
      heightMm: dto.heightMm ?? saved.heightMm,
      gapMm: dto.gapMm ?? saved.gapMm,
      showName: dto.showName ?? saved.showName,
      showBarcodeText: dto.showBarcodeText ?? saved.showBarcodeText,
      cropMarks: dto.cropMarks ?? saved.cropMarks,
    });

    // تولید PDF یعنی چاپ شد. اگر منتظر تأیید دستی بمانیم، کسی یادش می‌رود
    // و صف هیچ‌وقت خالی نمی‌شود. چاپ دوباره همیشه ممکن است.
    await this.products.markLabelsPrinted(
      (dto.items ?? []).map((i) => i.productId),
    );

    res.set({ 'Content-Type': 'text/html; charset=utf-8' });

    res.send(html);
  }
}