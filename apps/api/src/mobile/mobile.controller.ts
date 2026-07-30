import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  // لیست آیتم‌های در انتظار تایید یا نیازمند اصلاح
  @Get('review/pending')
  @UseGuards(JwtAuthGuard)
  async pendingReview(@Req() req: any) {
    return this.countService.listPendingReview();
  }

  // تایید دستی یه آیتم (توسط مدیر/کاربر)
  @Post('review/:itemId/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmReview(
    @Param('itemId') itemId: string,
    @Body() body: { productId?: string },
  ) {
    return this.countService.confirmItem(itemId, body.productId);
  }
}
