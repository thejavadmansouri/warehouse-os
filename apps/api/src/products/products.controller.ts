import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkOnlineDto } from './dto/bulk-online.dto';
import { BulkPriceDto } from './dto/bulk-price.dto';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * کاتالوگ سبک برای اپ کارگر (دانلود آفلاین). فقط فیلدهای لازم برای
   * انتخاب/سرچ را برمی‌گرداند — بدون عکس، قیمت یا موجودی تا حجم کم بماند.
   * `searchTokens` همان توکن‌های سمت سرور است تا موتور جستجوی آفلاین گوشی
   * دقیقاً همان نتایج POS را بدهد.
   */
  @Get('catalog')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  catalog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('updatedSince') updatedSince?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(
      2000,
      Math.max(1, parseInt(limit ?? '500', 10) || 500),
    );
    return this.productsService.catalog(
      pageNum,
      limitNum,
      updatedSince?.trim() || undefined,
    );
  }

  /**
   * کاتالوگ صندوق فروش: مثل `catalog` ولی با `salePrice`، تا سرچِ لوکالِ POS
   * قیمت را آنی نشان دهد. دسترسی دقیقاً مثل `locate` که همین حالا هم قیمت را به
   * این نقش‌ها می‌دهد — نه بیشتر. اپ کارگر این مسیر را صدا نمی‌زند.
   */
  @Get('pos-catalog')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  posCatalog(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('updatedSince') updatedSince?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(
      2000,
      Math.max(1, parseInt(limit ?? '500', 10) || 500),
    );
    return this.productsService.catalog(
      pageNum,
      limitNum,
      updatedSince?.trim() || undefined,
      true,
      // فقط مدیر: بهای خرید و قیمتِ پیشنهادی، همان قاعده‌ی attachStock.
      req.user?.role === Role.ADMIN || req.user?.role === Role.MANAGER,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('brandId') brandId?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(
      200,
      Math.max(1, parseInt(limit ?? '50', 10) || 50),
    );
    return this.productsService.findAll(
      pageNum,
      limitNum,
      search?.trim() || undefined,
      brandId?.trim() || undefined,
    );
  }

  @Get('search')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  search(@Query('q') q: string) {
    return this.productsService.search(q);
  }

  // «یافتن کالا» — سرچ + آدرس دقیقِ موجودی (همه‌ی نقش‌ها)
  // مدیر بهای خرید و قیمتِ پیشنهادیِ ۱۵٪ را هم می‌گیرد؛ بهای خرید برای
  // فروشنده نمی‌آید (حاشیه‌ی سود لو نرود) — همان قاعده‌ی قبلیِ attachStock.
  @Get('locate')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  locate(@Query('q') q: string, @Req() req: any) {
    return this.productsService.searchWithStock(q, {
      includePurchase:
        req.user?.role === Role.ADMIN || req.user?.role === Role.MANAGER,
    });
  }

  /**
   * موجودیِ زنده‌ی یک محصول — POS لوکال این را دقیقاً لحظه‌ی افزودن به سبد صدا
   * می‌زند (کاتالوگِ کش‌شده‌ی مرورگر موجودی ندارد). دسترسی دقیقاً مثل `locate`.
   */
  @Get(':id/pos-stock')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  posStock(@Param('id') id: string, @Req() req: any) {
    return this.productsService.productStock(id, {
      includePurchase:
        req.user?.role === Role.ADMIN || req.user?.role === Role.MANAGER,
    });
  }

  /**
   * موجودیِ زنده‌ی چند محصول با یک درخواست — نتایجِ رویِ صفحه‌ی سرچِ زنده‌ی POS
   * را «اصلاحِ زنده» می‌کند: کاتالوگِ لوکال فوری جواب می‌دهد ولی موجودی ندارد؛
   * همین مسیر برای همان چند نتیجه عددِ تازه می‌آورد. `ids` با کاما جدا می‌شود.
   */
  @Get('stock-batch')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  stockBatch(@Query('ids') ids: string, @Req() req: any) {
    const list = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    return this.productsService.productStockBatch(list, {
      includePurchase:
        req.user?.role === Role.ADMIN || req.user?.role === Role.MANAGER,
    });
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.MANAGER)
  async exportCsv(@Res() res: Response) {
    const csv = await this.productsService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=products-export.csv',
    );
    res.send(csv);
  }

  @Get('barcode/:barcode')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  detailByBarcode(@Param('barcode') barcode: string) {
    return this.productsService.detailByBarcode(barcode);
  }

  @Get('next-identifiers')
  @Roles(Role.ADMIN, Role.MANAGER)
  nextIdentifiers() {
    return this.productsService.nextIdentifiers();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  // کالاهایی که هنوز لیبل نخورده‌اند — صف چاپ روزانه.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('labels/pending')
  pendingLabels(
    @Query('onlyWithStock') onlyWithStock?: string,
    @Query('since') since?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.pendingLabels({
      onlyWithStock: onlyWithStock === 'true',
      since,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('labels/mark-printed')
  markLabelsPrinted(@Body() body: { productIds: string[] }) {
    return this.productsService.markLabelsPrinted(body?.productIds ?? []);
  }

  // ثبت قیمت جدید. ردیف تازه در تاریخچه می‌سازد، قیمت قبلی را بازنویسی نمی‌کند.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/prices')
  setPrice(
    @Param('id') id: string,
    @Body()
    dto: {
      purchasePrice?: number;
      salePrice?: number;
      wholesalePrice?: number;
      managerPrice?: number;
    },
  ) {
    return this.productsService.setPrice(id, dto);
  }

  /** قیمت‌گذاری دسته‌ای: انتخاب دستی، یک برند، یا نتیجه‌ی یک جست‌وجو. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('prices/bulk')
  bulkSetPrice(@Body() dto: BulkPriceDto) {
    return this.productsService.bulkSetPrice(dto);
  }

  /**
   * «نمایش در سایت» به‌صورت گروهی.
   *
   * فقط مدیر: این تصمیم می‌گیرد چه چیزی از کاتالوگ روی اینترنت دیده شود.
   */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('online/bulk')
  bulkSetOnline(@Body() dto: BulkOnlineDto) {
    return this.productsService.bulkSetOnline(dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get(':id/prices')
  priceHistory(@Param('id') id: string) {
    return this.productsService.priceHistory(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
