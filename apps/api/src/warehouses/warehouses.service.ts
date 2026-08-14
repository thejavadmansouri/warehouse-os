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

  async findAll() {
    const rows = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { locations: true } } },
    });
    // locationCount را تخت می‌کنیم تا UI بداند کد قابل ویرایش هست یا نه، و
    // دیالوگِ حذف بتواند صادقانه بگوید چند قفسه درگیر است.
    return rows.map(({ _count, ...w }) => ({
      ...w,
      locationCount: _count.locations,
    }));
  }

  // انبارهای غیرفعال — برای بخشِ «بازگردانی». این‌ها از لیستِ اصلی حذف شده‌اند
  // ولی کدشان هنوز اشغال است، پس باید یک‌جا دیده شوند تا کاربر گیج نشود.
  async findInactive() {
    const rows = await this.prisma.warehouse.findMany({
      where: { isActive: false },
      orderBy: { name: 'asc' },
      include: { _count: { select: { locations: true } } },
    });
    return rows.map(({ _count, ...w }) => ({
      ...w,
      locationCount: _count.locations,
    }));
  }

  async create(dto: CreateWarehouseDto) {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.prisma.warehouse.findUnique({ where: { code } });
    if (existing) {
      // تفکیکِ «کد یک انبارِ فعال» از «کد یک انبارِ غیرفعال». دومی همان گیجیِ
      // «حذفش کردم ولی می‌گوید هست» است؛ پس به‌جای بن‌بست، راهِ بازگردانی را
      // با id/نامِ همان انبار به UI می‌دهیم.
      if (!existing.isActive) {
        throw new ConflictException({
          error: 'WAREHOUSE_CODE_INACTIVE',
          warehouseId: existing.id,
          warehouseName: existing.name,
          message: `این کد متعلق به انبار «${existing.name}» است که غیرفعال شده — بازش گردان یا کد دیگری بزن.`,
        });
      }
      throw new ConflictException({
        error: 'WAREHOUSE_CODE_TAKEN',
        message: 'انباری با این کد از قبل وجود دارد',
      });
    }
    return this.prisma.warehouse.create({
      data: { name: dto.name.trim(), code },
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { _count: { select: { locations: true } } },
    });
    if (!warehouse) {
      throw new NotFoundException('انبار پیدا نشد');
    }

    const data: { name?: string; code?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();

    // کد فقط وقتی قابل تغییر است که هیچ موقعیتی زیر انبار نباشد — یعنی هنوز
    // لیبلی چاپ نشده. اگر قفسه دارد، کد داخل کدِ چاپ‌شده‌ی آن‌ها نشسته و
    // تغییرش یعنی لیبل‌های فیزیکی دروغ شوند.
    if (dto.code !== undefined) {
      const code = dto.code.toUpperCase().trim();
      if (code !== warehouse.code) {
        if (warehouse._count.locations > 0) {
          throw new ConflictException({
            error: 'WAREHOUSE_CODE_LOCKED',
            message:
              'این انبار قفسه دارد و کدش روی لیبل‌ها چاپ شده — کد دیگر قابل تغییر نیست. فقط نام را می‌شود عوض کرد.',
          });
        }
        const clash = await this.prisma.warehouse.findUnique({
          where: { code },
        });
        if (clash && clash.id !== id) {
          throw new ConflictException({
            error: 'WAREHOUSE_CODE_TAKEN',
            message: 'انباری با این کد از قبل وجود دارد',
          });
        }
        data.code = code;
      }
    }

    return this.prisma.warehouse.update({ where: { id }, data });
  }

  // بازگردانی انبارِ غیرفعال — همه‌ی قفسه‌ها و موجودی‌اش سرِ جایشان مانده‌اند
  // (حذفِ انبار فقط پرچمِ خودش را پایین آورده، نه زیرمجموعه‌ها را)، پس کافی است
  // دوباره فعال شود.
  async reactivate(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('انبار پیدا نشد');
    }
    if (warehouse.isActive) {
      return { mode: 'already-active' as const, message: 'این انبار از قبل فعال است.' };
    }
    await this.prisma.warehouse.update({
      where: { id },
      data: { isActive: true },
    });
    return {
      mode: 'reactivated' as const,
      message: `انبار «${warehouse.name}» بازگردانده شد.`,
    };
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
