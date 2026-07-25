import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { AddItemDto } from './dto/add-item.dto';

@Injectable()
export class InventoryCountService {
  constructor(private prisma: PrismaService, private operation: InventoryOperationService) {}

  async findAll(){
    return this.prisma.inventoryCount.findMany({
      orderBy:{ createdAt:'desc' },
      include:{ location:true, items:true }
    });
  }


  async create(dto: CreateInventoryCountDto) {
    return this.prisma.inventoryCount.create({
      data: { sessionId: dto.sessionId, locationId: dto.locationId, userId: dto.userId },
    });
  }

  async addItem(countId: string, dto: AddItemDto) {
    return this.prisma.inventoryItem.create({
      data: {
        countId,
        productId: dto.productId,
        name: dto.name,
        goodQuantity: dto.goodQuantity ?? 0,
        badQuantity: dto.badQuantity ?? 0,
        voiceText: dto.voiceText,
        note: dto.note,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.inventoryCount.findUnique({ where: { id }, include: { items: true } });
  }

  async finish(id: string) {
    return this.prisma.inventoryCount.update({ where: { id }, data: { status: 'FINISHED', finishedAt: new Date() } });
  }

  async apply(id: string) {
    const count = await this.prisma.inventoryCount.findUnique({ where: { id }, include: { items: true } });
    if (!count) throw new NotFoundException('Inventory count not found');

    const grouped = new Map<string, { name: string; goodQuantity: number; itemIds: string[] }>();
    const unlinked: { name: string }[] = [];

    for (const item of count.items) {
      if (!item.productId) { unlinked.push({ name: item.name }); continue; }
      const existing = grouped.get(item.productId);
      if (existing) { existing.goodQuantity += item.goodQuantity; existing.itemIds.push(item.id); }
      else grouped.set(item.productId, { name: item.name, goodQuantity: item.goodQuantity, itemIds: [item.id] });
    }

    const results: any[] = unlinked.map((u) => ({ item: u.name, status: 'NO_PRODUCT_LINK' }));

    for (const [productId, data] of grouped.entries()) {
      const r = await this.operation.execute({
        type: 'ADJUST',
        productId,
        locationId: count.locationId,
        targetQuantity: data.goodQuantity,
        source: 'MOBILE',
        note: `Inventory count adjustment (${data.itemIds.length} item(s) merged)`,
      });
      results.push({ product: data.name, oldQty: r.oldQty, newQty: r.newQty, diff: r.diff });
    }

    await this.prisma.inventoryCount.update({ where: { id }, data: { status: 'APPLIED' } });
    return results;
  }
}
