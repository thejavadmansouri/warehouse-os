import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineService } from '../engine/parsing-engine.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { ProductMatcherService } from './product-matcher.service';

@Injectable()
export class VoiceInventoryService {
  constructor(
    private prisma: PrismaService,
    private inventoryOperation: InventoryOperationService,
    private parsingEngine: ParsingEngineService,
    private productMatcher: ProductMatcherService,
  ) {}

  async process(
    locationBarcode: string,
    text: string,
    sessionId: string,
    userId?: string,
  ) {
    const location = await this.prisma.location.findUnique({
      where: { barcode: locationBarcode },
    });

    if (!location) {
      throw new Error('Location not found');
    }

    const engineResult = this.parsingEngine.parse(text);

    const parsed = engineResult.data;
    const unknownTokens = engineResult.explanation.unknownTokens ?? [];

    // اگر هیچ اطلاعات مفیدی استخراج نشده
    if (
      !parsed.brand &&
      !parsed.vehicleFamily &&
      unknownTokens.length === 0
    ) {
      return {
        success: false,
        needSelection: true,
        message: 'کالا شناسایی نشد',
        parsed,
        suggestions: [],
      };
    }

    // تبدیل نام قطعه، برند و خودرو به id
    // توجه: findVehicleModelIdsByName ممکن است چند تریم (GLX/SLX/...) برگرداند
    const [partCatalogId, vehicleModelIds, brandId] = await Promise.all([
      this.productMatcher.findPartCatalogIdByName(parsed.productName),
      this.productMatcher.findVehicleModelIdsByName(parsed.vehicleModel ?? parsed.vehicleFamily),
      this.productMatcher.findBrandIdByName(parsed.brand),
    ]);

    const matchResult = await this.productMatcher.match({
      partCatalogId,
      partName: parsed.productName,
      vehicleModelIds,
      vehicleName: parsed.vehicleModel ?? parsed.vehicleFamily,
      brandId,
      brandName: parsed.brand,
      keywordTokens: unknownTokens,
      modelIsExplicit: !!parsed.vehicleModel,
    });

    if (matchResult.status === 'NONE') {
      return {
        success: false,
        needSelection: true,
        message: 'محصول پیدا نشد',
        parsed,
        suggestions: [],
      };
    }

    if (matchResult.status === 'SUGGEST') {
      return {
        success: false,
        needSelection: true,
        message:
          !parsed.vehicleFamily && !parsed.vehicleModel
            ? 'برای نتیجه‌ی دقیق‌تر، خودرو را هم بگویید — یا یکی را از لیست انتخاب کنید'
            : 'چند محصول مشابه پیدا شد، لطفاً یکی را انتخاب کنید',
        parsed,
        suggestions: matchResult.suggestions.map((s) => ({
          product: s.product,
          confidence: s.confidence,
          reasons: s.reasons,
        })),
      };
    }

    const product = matchResult.best!.product;
    const quantity = parsed.quantity || 1;

    const inventory = await this.inventoryOperation.execute({
      type: 'IN',
      productId: product.id,
      locationId: location.id,
      quantity,
      note: text,
      source: 'VOICE',
      sessionId,
      userId,
    });

    return {
      success: true,
      parsed,
      product,
      quantity,
      location,
      inventory,
      confidence: matchResult.best!.confidence,
      reasons: matchResult.best!.reasons,
    };
  }

  // پیش‌نمایش صوتی: همان parse + match، اما بدون ثبت موجودی.
  // طبق قانون «voice هرگز auto-commit نمی‌کند» — روی match مطمئن به‌جای commit،
  // proposal برمی‌گرداند تا کارگر در اپ تأیید کند، سپس از طریق confirm ثبت شود.
  async preview(
    locationBarcode: string,
    text: string,
    sessionId: string,
  ) {
    const location = await this.prisma.location.findUnique({
      where: { barcode: locationBarcode },
    });

    if (!location) {
      throw new Error('Location not found');
    }

    const engineResult = this.parsingEngine.parse(text);
    const parsed = engineResult.data;
    const unknownTokens = engineResult.explanation.unknownTokens ?? [];

    if (!parsed.brand && !parsed.vehicleFamily && unknownTokens.length === 0) {
      return {
        success: false,
        needSelection: true,
        message: 'کالا شناسایی نشد',
        parsed,
        suggestions: [],
      };
    }

    const [partCatalogId, vehicleModelIds, brandId] = await Promise.all([
      this.productMatcher.findPartCatalogIdByName(parsed.productName),
      this.productMatcher.findVehicleModelIdsByName(parsed.vehicleModel ?? parsed.vehicleFamily),
      this.productMatcher.findBrandIdByName(parsed.brand),
    ]);

    const matchResult = await this.productMatcher.match({
      partCatalogId,
      partName: parsed.productName,
      vehicleModelIds,
      vehicleName: parsed.vehicleModel ?? parsed.vehicleFamily,
      brandId,
      brandName: parsed.brand,
      keywordTokens: unknownTokens,
      modelIsExplicit: !!parsed.vehicleModel,
    });

    if (matchResult.status === 'NONE') {
      return {
        success: false,
        needSelection: true,
        message: 'محصول پیدا نشد',
        parsed,
        suggestions: [],
      };
    }

    if (matchResult.status === 'SUGGEST') {
      return {
        success: false,
        needSelection: true,
        message:
          !parsed.vehicleFamily && !parsed.vehicleModel
            ? 'برای نتیجه‌ی دقیق‌تر، خودرو را هم بگویید — یا یکی را از لیست انتخاب کنید'
            : 'چند محصول مشابه پیدا شد، لطفاً یکی را انتخاب کنید',
        parsed,
        suggestions: matchResult.suggestions.map((s) => ({
          product: s.product,
          confidence: s.confidence,
          reasons: s.reasons,
        })),
      };
    }

    // BEST — به‌جای ثبت، proposal برمی‌گردانیم؛ ثبت فقط از مسیر confirm انجام می‌شود.
    const product = matchResult.best!.product;
    const quantity = parsed.quantity || 1;

    return {
      success: true,
      needConfirm: true,
      parsed,
      product,
      quantity,
      location,
      confidence: matchResult.best!.confidence,
      reasons: matchResult.best!.reasons,
    };
  }

  // تایید دستی زمانی که کاربر از بین پیشنهادها انتخاب می‌کند
  async confirm(dto: any) {
    const {
      productId,
      locationBarcode,
      quantity,
      sessionId,
      note,
      userId,
    } = dto;

    const location = await this.prisma.location.findUnique({
      where: {
        barcode: locationBarcode,
      },
    });

    if (!location) {
      throw new Error('موقعیت پیدا نشد');
    }

    const inventory = await this.inventoryOperation.execute({
      type: 'IN',
      productId,
      locationId: location.id,
      quantity: quantity || 1,
      note: note || 'تایید دستی بعد از عدم تشخیص صوتی',
      source: 'VOICE_MANUAL_CONFIRM',
      sessionId,
      userId,
    });

    return {
      success: true,
      productId,
      location,
      inventory,
    };
  }
}
