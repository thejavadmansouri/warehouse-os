import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryOperationService {
  constructor(private prisma: PrismaService) {}

  async execute(dto: any): Promise<any> {
    const { type, productId, locationId, toLocationId, note, userId, sessionId, voiceRecordId } = dto;

    // اگر sessionId فرستاده شده، باید از قبل واقعاً ساخته شده باشه (با InventorySessionService.start)
    // دیگه اینجا به‌صورت خاموش سشن جعلی ساخته نمی‌شه چون warehouseId/متادیتای درست نداره
    // و مخفی‌کردن این خطا باعث گم‌شدن باگ‌های واقعی توی جریان کار می‌شه.
    if (sessionId) {
      const session = await this.prisma.inventorySession.findUnique({ where: { id: sessionId } });
      if (!session) {
        throw new NotFoundException({ error: 'SESSION_NOT_FOUND', message: 'سشن انبارگردانی معتبر نیست؛ ابتدا سشن را استارت کنید' });
      }
    }

    // منبع عملیات (SALE، MANUAL_TRANSFER و ...) دیگه به MANUAL تبدیل نمی‌شه؛
    // چون فیلد source روی InventoryLog یک String سادست (نه enum محدود)، مقدار واقعی نگه داشته می‌شه
    // تا در لاگ فعالیت‌ها منبع دقیق عملیات قابل ردیابی بمونه.
    const source = dto.source || 'MANUAL';
    const quantity = Number(dto.quantity);

    if (type !== 'ADJUST' && (!quantity || quantity <= 0)) {
      throw new BadRequestException({ error: 'INVALID_QUANTITY', message: 'تعداد نامعتبر است' });
    }

    const logBase = {
      productId,
      userId: userId ?? null,
      sessionId: sessionId ?? null,
      voiceRecordId: voiceRecordId ?? null,
      source,
      note: note ?? null,
    };

    if (type === 'IN') {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.inventory.upsert({
          where: { productId_locationId: { productId, locationId } },
          update: { quantity: { increment: quantity } },
          create: { productId, locationId, quantity },
        });
        await tx.inventoryLog.create({ data: { ...logBase, locationId, quantity, action: 'IN' } });
        return updated;
      });
    }

    if (type === 'OUT' || type === 'SALE') {
      return this.prisma.$transaction(async (tx) => {
        // چک موجودی و کم‌کردنش داخل همون تراکنش انجام می‌شه تا زیر بار همزمان چند کاربر
        // (چند کارگر انبار که هم‌زمان روی یک کالا کار می‌کنن) race condition و موجودی منفی رخ نده
        const inventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId, locationId } },
        });
        if (!inventory || inventory.quantity < quantity) {
          throw new BadRequestException({ error: 'INSUFFICIENT_STOCK', available: inventory?.quantity ?? 0 });
        }
        const updated = await tx.inventory.update({
          where: { productId_locationId: { productId, locationId } },
          data: { quantity: { decrement: quantity } },
        });
        await tx.inventoryLog.create({
          data: { ...logBase, locationId, quantity, action: type === 'SALE' ? 'SALE' : 'OUT' },
        });
        return updated;
      });
    }

    if (type === 'TRANSFER') {
      if (!toLocationId) throw new BadRequestException({ error: 'DESTINATION_REQUIRED' });
      const result = await this.prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId, locationId } },
        });
        if (!inventory || inventory.quantity < quantity) {
          throw new BadRequestException({ error: 'INSUFFICIENT_STOCK', available: inventory?.quantity ?? 0 });
        }
        await tx.inventory.update({
          where: { productId_locationId: { productId, locationId } },
          data: { quantity: { decrement: quantity } },
        });
        const destination = await tx.inventory.upsert({
          where: { productId_locationId: { productId, locationId: toLocationId } },
          update: { quantity: { increment: quantity } },
          create: { productId, locationId: toLocationId, quantity },
        });
        await tx.inventoryLog.createMany({
          data: [
            { ...logBase, locationId, quantity, action: 'TRANSFER', note: `TRANSFER OUT -> ${toLocationId}` },
            { ...logBase, locationId: toLocationId, quantity, action: 'TRANSFER', note: `TRANSFER IN <- ${locationId}` },
          ],
        });
        return destination;
      });
      return { success: true, operation: 'TRANSFER', quantity, inventory: result };
    }

    if (type === 'ADJUST') {
      const targetQty = Number(dto.targetQuantity);
      if (isNaN(targetQty) || targetQty < 0) {
        throw new BadRequestException({ error: 'INVALID_TARGET_QUANTITY' });
      }
      return this.prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.findUnique({
          where: { productId_locationId: { productId, locationId } },
        });
        const oldQty = inventory?.quantity ?? 0;
        const diff = targetQty - oldQty;
        const updated = await tx.inventory.upsert({
          where: { productId_locationId: { productId, locationId } },
          update: { quantity: targetQty },
          create: { productId, locationId, quantity: targetQty },
        });
        if (diff !== 0) {
          await tx.inventoryLog.create({ data: { ...logBase, locationId, quantity: diff, action: 'ADJUST' } });
        }
        return { success: true, operation: 'ADJUST', oldQty, newQty: targetQty, diff, inventory: updated };
      });
    }

    throw new BadRequestException({ error: 'INVALID_OPERATION_TYPE' });
  }
}