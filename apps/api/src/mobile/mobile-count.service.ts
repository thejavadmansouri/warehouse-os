import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineService } from '../engine/parsing-engine.service';

const CONFIDENCE_AUTO_CONFIRM = 95;
const CONFIDENCE_NEEDS_REVIEW = 80;

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

  async addVoiceItem(countId: string, text: string, userId?: string) {
    const engineResult = this.parsingEngine.parse(text);
    const parsed = engineResult.data;
    const confidence = engineResult.explanation.confidence;

    const matchedProduct = await this.findBestMatchingProduct(
      parsed.productName,
      parsed.brand,
      parsed.vehicleFamily,
    );

    const goodQuantity = parsed.goodQuantity || parsed.quantity || 1;
    const badQuantity = parsed.badQuantity || 0;

    const reviewStatus = this.resolveReviewStatus(confidence, matchedProduct);

    const item = await this.prisma.inventoryItem.create({
      data: {
        countId,
        productId: matchedProduct?.id ?? null,
        name: matchedProduct?.name || parsed.productName || text,
        goodQuantity,
        badQuantity,
        voiceText: text,
        voiceConfidence: confidence,
        recognizedName: parsed.productName,
        recognizedBrand: parsed.brand,
        recognizedCategory: parsed.vehicleFamily,
        reviewStatus,
      },
    });

    return {
      success: true,
      matched: !!matchedProduct,
      matchedProduct: matchedProduct
        ? { id: matchedProduct.id, name: matchedProduct.name }
        : null,
      confidence,
      reviewStatus,
      needsConfirmation: reviewStatus === 'NEEDS_REVIEW',
      needsCorrection: reviewStatus === 'NEEDS_CORRECTION',
      item,
      explanation: engineResult.explanation,
    };
  }

  private resolveReviewStatus(
    confidence: number,
    matchedProduct: { id: string; name: string } | null,
  ): 'CONFIRMED' | 'NEEDS_REVIEW' | 'NEEDS_CORRECTION' {
    if (!matchedProduct) {
      return confidence >= CONFIDENCE_NEEDS_REVIEW
        ? 'NEEDS_REVIEW'
        : 'NEEDS_CORRECTION';
    }

    if (confidence >= CONFIDENCE_AUTO_CONFIRM) return 'CONFIRMED';
    if (confidence >= CONFIDENCE_NEEDS_REVIEW) return 'NEEDS_REVIEW';
    return 'NEEDS_CORRECTION';
  }

  async listPendingReview(warehouseId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: {
        reviewStatus: { in: ['NEEDS_REVIEW', 'NEEDS_CORRECTION'] },
        ...(warehouseId
          ? { count: { session: { warehouseId } } }
          : {}),
      },
      include: {
        product: true,
        brand: true,
        count: { include: { location: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async confirmItem(itemId: string, productId?: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException('آیتم یافت نشد.');
    }

    return this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        reviewStatus: 'CONFIRMED',
        ...(productId ? { productId } : {}),
      },
    });
  }

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
