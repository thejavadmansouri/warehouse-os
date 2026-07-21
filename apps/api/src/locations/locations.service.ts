import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.location.findMany({
      include: { type: true, parent: true },
    });
  }

  async findChildren(parentId: string | null) {
    return this.prisma.location.findMany({
      where: { parentId },
      include: { type: true },
    });
  }

  create(data: { name: string; typeId: string; parentId?: string }) {
    return this.prisma.location.create({ data, include: { type: true } });
  }

  async resolveByBarcode(barcode: string) {
    const location = await this.prisma.location.findUnique({
      where: { barcode },
      include: { type: true, parent: { include: { type: true } } },
    });
    if (!location) {
      throw new NotFoundException('موقعیتی با این بارکد یافت نشد');
    }
    return location;
  }

  async getPath(id: string): Promise<string> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { type: true },
    });
    if (!location) throw new NotFoundException('موقعیت یافت نشد');
    if (!location.parentId) return `${location.type.name} ${location.name}`;
    const parentPath = await this.getPath(location.parentId);
    return `${parentPath} > ${location.type.name} ${location.name}`;
  }
}
