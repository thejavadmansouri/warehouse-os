import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { MobileCountService } from './mobile-count.service';

@Controller('mobile')
export class MobileController {
  constructor(
    private prisma: PrismaService,
    private countService: MobileCountService,
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
  async startCount(
    @Body() body: { locationBarcode: string },
    @Req() req: any,
  ) {
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
}
