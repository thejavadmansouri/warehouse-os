import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(warehouseId?: string) {
    return this.prisma.locationType.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      orderBy: { depth: 'asc' },
    });
  }

  create(data: { warehouseId: string; name: string; depth: number }) {
    return this.prisma.locationType.create({ data });
  }
}
