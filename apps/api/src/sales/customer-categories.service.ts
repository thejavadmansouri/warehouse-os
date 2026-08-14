import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerCategoryDto,
  UpdateCustomerCategoryDto,
} from './dto/customer-category.dto';


/**
 * دسته‌های مشتری — چیزی که مدیر تعریف می‌کند و مشتری‌ها بر اساسش دسته‌بندی
 * و فیلتر می‌شوند.
 *
 * حذف واقعی وجود ندارد: غیرفعال‌سازی، مشتری‌های دسته را دست‌نخورده نگه
 * می‌دارد و فقط از انتخاب‌های جدید حذفشان می‌کند.
 */
@Injectable()
export class CustomerCategoriesService {

  constructor(private prisma: PrismaService) {}


  /** همه‌ی دسته‌ها (فعال و غیرفعال) با شمارش مشتری — برای صفحه‌ی مدیریت. */
  async list() {
    return this.prisma.customerCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    });
  }


  /** فقط دسته‌های فعال — برای dropdown فرم‌ها و فیلتر. */
  async active() {
    return this.prisma.customerCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }


  async create(input: CreateCustomerCategoryDto) {
    const name = input.name.trim();

    if (!name) {
      throw new BadRequestException({
        error: 'NAME_REQUIRED',
        message: 'نام دسته الزامی است',
      });
    }

    const dup = await this.prisma.customerCategory.findUnique({ where: { name } });
    if (dup) {
      throw new BadRequestException({
        error: 'NAME_TAKEN',
        message: 'دسته‌ای با این نام وجود دارد',
      });
    }

    return this.prisma.customerCategory.create({
      data: {
        name,
        color: input.color?.trim() || '#64748b',
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }


  async update(id: string, input: UpdateCustomerCategoryDto) {
    await this.ensureExists(id);

    if (input.name !== undefined) {
      const name = input.name.trim();
      const dup = await this.prisma.customerCategory.findFirst({
        where: { name, id: { not: id } },
      });
      if (dup) {
        throw new BadRequestException({
          error: 'NAME_TAKEN',
          message: 'دسته‌ای با این نام وجود دارد',
        });
      }
    }

    return this.prisma.customerCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color.trim() } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }


  /** غیرفعال‌سازی — مشتری‌های دسته دست نمی‌خورند، فقط از انتخاب‌های جدید می‌افتد. */
  async deactivate(id: string) {
    await this.ensureExists(id);
    return this.prisma.customerCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }


  /** برای customers.service — مطمئن می‌شود دسته موجود و فعال است. */
  async assertActive(id: string) {
    const cat = await this.prisma.customerCategory.findFirst({
      where: { id, isActive: true },
    });
    if (!cat) {
      throw new BadRequestException({
        error: 'CATEGORY_NOT_FOUND',
        message: 'دسته‌ی مشتری پیدا نشد',
      });
    }
    return cat;
  }


  private async ensureExists(id: string) {
    const existing = await this.prisma.customerCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        error: 'CATEGORY_NOT_FOUND',
        message: 'دسته پیدا نشد',
      });
    }
    return existing;
  }
}
