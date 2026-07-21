import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.product.findMany({
      include: { inventoryLogs: true },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { inventoryLogs: true },
    });
    if (!product) {
      throw new NotFoundException(`کالایی با شناسه ${id} یافت نشد`);
    }
    return product;
  }

  create(data: { name: string; sku: string }) {
    return this.prisma.product.create({ data });
  }

  async update(id: string, data: { name?: string; sku?: string }) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.product.delete({ where: { id } });
  }
}
