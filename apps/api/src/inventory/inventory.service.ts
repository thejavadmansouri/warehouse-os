import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extractInventoryFromVoice } from '../lib/voice-parser';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.inventoryLog.findMany({
      include: { product: true, location: { include: { type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: { productId: string; locationId: string; quantity: number }) {
    return this.prisma.inventoryLog.create({
      data,
      include: { product: true, location: { include: { type: true } } },
    });
  }

  findByLocation(locationId: string) {
    return this.prisma.inventoryLog.findMany({
      where: { locationId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async voiceEntry(data: { locationId: string; voiceText: string }) {
    const location = await this.prisma.location.findUnique({
      where: { id: data.locationId },
    });
    if (!location) {
      throw new NotFoundException('موقعیت مورد نظر یافت نشد؛ ابتدا بارکد را اسکن کنید');
    }

    const parsed = extractInventoryFromVoice(data.voiceText);

    if (!parsed.productName) {
      throw new BadRequestException('نام کالا از متن صوتی قابل تشخیص نبود');
    }
    if (!parsed.quantity) {
      throw new BadRequestException(
        'تعداد مشخص نشد؛ لطفاً واحد را صریح بگویید (مثلاً «۳۰ عدد»)',
      );
    }

    let product = await this.prisma.product.findFirst({
      where: { name: parsed.productName, brand: parsed.brand },
    });

    if (!product) {
      product = await this.prisma.product.create({
        data: {
          name: parsed.productName,
          brand: parsed.brand,
          compatibleVehicle: parsed.compatibleVehicle,
          sku: `AUTO-${Date.now()}`,
        },
      });
    }

    const inventoryLog = await this.prisma.inventoryLog.create({
      data: {
        productId: product.id,
        locationId: data.locationId,
        quantity: parsed.quantity,
      },
      include: { product: true, location: { include: { type: true } } },
    });

    return { parsed, product, inventoryLog };
  }
}
