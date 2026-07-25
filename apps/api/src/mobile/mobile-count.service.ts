import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineService } from '../engine/parsing-engine.service';

@Injectable()
export class MobileCountService {
  constructor(
    private prisma: PrismaService,
    private parsingEngine: ParsingEngineService,
  ) {}

  async start(locationBarcode: string, userId: string) {
    const location = await this.prisma.location.findUnique({
      where: { barcode: locationBarcode },
    });

    if (!location) {
      throw new NotFoundException('قفسه یا موقعیت یافت نشد.');
    }

    const session = await this.prisma.inventorySession.create({
      data: {
        userId: userId,
        status: 'ACTIVE',
      },
    });

    const count = await this.prisma.inventoryCount.create({
      data: {
        sessionId: session.id,
        locationId: location.id,
      },
    });

    return {
      sessionId: session.id,
      countId: count.id,
      location: {
        id: location.id,
        name: location.name,
        barcode: location.barcode,
      },
    };
  }

  // ثبت آیتم شمارش با صدا — الان از همون موتور اصلی voice parsing استفاده می‌کنه
  // (src/engine) که دیکشنری‌اش از دیتابیس لود می‌شه، به‌جای پارسر جدا و هاردکد قبلی
  // (src/lib/voice-parser.ts) که حذف شد. این باعث می‌شه ثبت صوتی کالا و شمارش صوتی
  // دقیقاً یک نتیجه برای یک جمله بدن، و برند/مدل جدید توی دیتابیس بدون تغییر کد شناخته بشه.
  async addVoiceItem(countId: string, text: string, userId?: string) {
    const engineResult = this.parsingEngine.parse(text);
    const parsed = engineResult.data;

    const matchedProduct = await this.findBestMatchingProduct(
      parsed.productName,
      parsed.brand,
      parsed.vehicleFamily,
    );

    const goodQuantity = parsed.goodQuantity || parsed.quantity || 1;
    const badQuantity = parsed.badQuantity || 0;

    const item = await this.prisma.inventoryItem.create({
      data: {
        countId,
        productId: matchedProduct?.id ?? null,
        name: matchedProduct?.name || parsed.productName || text,
        goodQuantity,
        badQuantity,
        voiceText: text,
        recognizedName: parsed.productName,
        recognizedBrand: parsed.brand,
        recognizedCategory: parsed.vehicleFamily,
      },
    });

    return {
      success: true,
      matched: !!matchedProduct,
      matchedProduct: matchedProduct
        ? { id: matchedProduct.id, name: matchedProduct.name }
        : null,
      item,
      explanation: engineResult.explanation,
    };
  }

  // تطبیق کالا فقط بر اساس فیلدهای ساختاریافته‌ای که موتور تشخیص داده انجام می‌شه —
  // دیگه کل جدول محصولات (که می‌تونه هزاران ردیف باشه) لود و توی جاوااسکریپت خطی
  // فیلتر نمی‌شه؛ این کوئری مستقیم به دیتابیس سپرده می‌شه.
  private async findBestMatchingProduct(
    productName?: string | null,
    brand?: string | null,
    vehicleFamily?: string | null,
  ) {
    if (!productName && !brand && !vehicleFamily) return null;

    return this.prisma.product.findFirst({
      where: {
        AND: [
          productName ? { name: { contains: productName, mode: 'insensitive' } } : {},
          brand ? { brand: { name: { contains: brand, mode: 'insensitive' } } } : {},
          vehicleFamily
            ? { vehicleModel: { name: { contains: vehicleFamily, mode: 'insensitive' } } }
            : {},
        ],
      },
      include: { brand: true, vehicleModel: true },
    });
  }
}
