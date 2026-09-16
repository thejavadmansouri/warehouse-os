import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { BlankQuotationsService } from '../sales/blank-quotations.service';
import { CreateBlankQuotationDto } from '../sales/dto/blank-quotation.dto';
import { MobileCountService } from './mobile-count.service';

@Controller('mobile')
export class MobileController {
  constructor(
    private prisma: PrismaService,
    private countService: MobileCountService,
    private blankQuotations: BlankQuotationsService,
  ) {}

  @Get('products/scan/:barcode')
  async scan(@Param('barcode') barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        barcodes: {
          some: { barcode },
        },
      },
      include: {
        brand: true,
        vehicleModel: true,
        assets: { where: { type: 'PRODUCT_IMAGE' } },
        barcodes: true,
        inventories: {
          where: { quantity: { gt: 0 } },
          include: { location: true },
        },
      },
    });

    if (!product) {
      return { found: false };
    }

    return {
      found: true,
      product: {
        id: product.id,
        name: product.name,
        image: product.assets[0]?.path ?? null,
        brand: product.brand?.name ?? null,
        vehicle: product.vehicleModel?.name ?? null,
        barcodes: product.barcodes.map((b) => ({
          barcode: b.barcode,
          type: b.type,
        })),
      },
      stock: product.inventories.map((item) => ({
        location: item.location.name,
        locationBarcode: item.location.barcode,
        quantity: item.quantity,
      })),
    };
  }

  // موجودیِ فعلی یک قفسه برای «انتقال بین قفسه» — همان الگوی count/start که
  // بارکد را سمت سرور resolve می‌کند. فقط ردیف‌های با موجودی مثبت برمی‌گردد؛
  // قفسه‌ی خالی یعنی لیست خالی، نه خطا.
  @Get('shelf/:barcode/stock')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  async shelfStock(@Param('barcode') barcode: string) {
    const location = await this.prisma.location.findUnique({
      where: { barcode },
    });

    if (!location) {
      throw new NotFoundException('قفسه یا موقعیت یافت نشد.');
    }

    const items = await this.prisma.inventory.findMany({
      where: {
        locationId: location.id,
        quantity: { gt: 0 },
      },
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      location: {
        id: location.id,
        name: location.name,
        barcode: location.barcode,
      },
      items: items.map((i) => ({
        productId: i.productId,
        name: i.product.name,
        sku: i.product.sku,
        availableQty: i.quantity,
      })),
    };
  }

  // شروع شمارش یک قفسه توسط انباردار
  @Post('count/start')
  @UseGuards(JwtAuthGuard)
  async startCount(@Body() body: { locationBarcode: string }, @Req() req: any) {
    return this.countService.start(body.locationBarcode, req.user.userId);
  }

  @Post('count/:countId/voice')
  @UseGuards(JwtAuthGuard)
  async voiceCount(
    @Param('countId') countId: string,
    @Body() body: { text: string },
    @Req() req: any,
  ) {
    return this.countService.addVoiceItem(countId, body.text, req.user.userId);
  }

  // لیست آیتم‌های در انتظار تایید یا نیازمند اصلاح — فقط مدیر.
  @Get('review/pending')
  @Roles(Role.ADMIN, Role.MANAGER)
  async pendingReview(@Req() req: any) {
    return this.countService.listPendingReview();
  }

  // تایید دستی یه آیتم — فقط مدیر. این همان تأییدی است که کلِ چرخه‌ی «پیشنهاد
  // بده، مدیر تأیید کند» رویش بنا شده؛ اگر کارگر خودش بزند، بازبینی بی‌معنا
  // می‌شود و می‌تواند productId دلخواه به موجودی بچسباند.
  @Post('review/:itemId/confirm')
  @Roles(Role.ADMIN, Role.MANAGER)
  async confirmReview(
    @Param('itemId') itemId: string,
    @Body() body: { productId?: string },
  ) {
    return this.countService.confirmItem(itemId, body.productId);
  }

  // ---------- پیش‌فاکتور سفید (از گوشی) ----------

  /*
   * چرا این روت در `mobile` است و نه در `sales`:
   *
   * سازندهٔ برگه می‌تواند کارگر باشد (STAFF) و کل سطح `sales/*` برای کارگر
   * بسته است. باز کردنِ `sales/quotations` به روی STAFF یعنی باز کردن فاکتور،
   * پرداخت و دفتر مشتریان هم. پس فقط همین یک توانایی، از همین یک روت داده
   * می‌شود و انبار را هم سرور خودش انتخاب می‌کند (گوشی `warehouseId` ندارد).
   */
  @Post('blank-quotations')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  async createBlankQuotation(@Body() dto: CreateBlankQuotationDto, @Req() req: any) {
    const created = await this.blankQuotations.create(dto, req.user?.userId);
    return { id: created.id, number: created.number, status: created.status };
  }

  // سفیدهای همین کاربر — گوشی بعد از سینک می‌بیند چه فرستاده و در چه وضعی است.
  @Get('blank-quotations/mine')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  async myBlankQuotations(@Req() req: any, @Query('limit') limit?: string) {
    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    const rows = await this.prisma.blankQuotation.findMany({
      where: { userId: req.user?.userId ?? null },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        customerName: true,
        lines: { select: { pricedAt: true } },
      },
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        createdAt: r.createdAt,
        customerName: r.customerName,
        unpricedCount: r.lines.filter((l) => l.pricedAt === null).length,
      })),
    };
  }
}
