import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateWarehouseDto) {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.prisma.warehouse.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException('انباری با این کد از قبل وجود دارد');
    }
    return this.prisma.warehouse.create({
      data: { name: dto.name.trim(), code },
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('انبار پیدا نشد');
    }
    return this.prisma.warehouse.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) },
    });
  }

  // حذف امن: انباری که موقعیت دارد فقط غیرفعال می‌شود (چون کد موقعیت‌ها به کد انبار
  // وابسته است و سابقه‌ی موجودی به موقعیت‌ها). انبار کاملاً خالی واقعاً حذف می‌شود.
  async remove(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('انبار پیدا نشد');
    }

    const locationCount = await this.prisma.location.count({
      where: { warehouseId: id },
    });

    if (locationCount > 0) {
      await this.prisma.warehouse.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        mode: 'deactivated' as const,
        locationCount,
        message: `انبار «${warehouse.name}» غیرفعال شد (${locationCount} موقعیت دارد و حذف کامل نشد).`,
      };
    }

    // خالی است → حذف واقعی به‌همراه انواع موقعیتش (که چیزی به آن‌ها اشاره نمی‌کند)
    await this.prisma.$transaction([
      this.prisma.locationType.deleteMany({ where: { warehouseId: id } }),
      this.prisma.warehouse.delete({ where: { id } }),
    ]);
    return {
      mode: 'deleted' as const,
      locationCount: 0,
      message: `انبار «${warehouse.name}» حذف شد.`,
    };
  }
}
