import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductShortageStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { CreateShortageDto, ResolveShortageDto } from './dto/create-shortage.dto';


/**
 * کسری محصول — تقاضایی که جواب نگرفت.
 *
 * **هیچ حرکتِ انباری نمی‌سازد.** این عمدی است و مهم‌ترین قاعده‌ی این سرویس
 * است: ثبتِ کسری یک سیگنالِ خرید است، نه اصلاحِ موجودی. اگر اجازه می‌داد
 * فروشنده عدد قفسه را عوض کند، شش ماه بعد هیچ‌کس نمی‌دانست موجودی‌ها از کجا
 * آمده‌اند — و آن ضرری است که با هیچ گزارشی جبران نمی‌شود.
 *
 * اصلاحِ موجودی کارِ `ADJUST` است که رد باقی می‌گذارد.
 */
@Injectable()
export class ShortagesService {

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}


  async create(dto: CreateShortageDto, userId?: string) {

    const created = await this.prisma.productShortage.create({
      data:{
        productId: dto.productId ?? null,
        productName: dto.productName.trim(),
        quantity: dto.quantity ?? 1,
        customerId: dto.customerId ?? null,
        warehouseId: dto.warehouseId,
        userId: userId ?? null,
        note: dto.note?.trim() || null,
      },
      include:{
        product:{ select:{ id:true, name:true, sku:true } },
        customer:{ select:{ id:true, firstName:true, lastName:true } },
      },
    });

    // مدیر بدون رفرش ببیند — تقاضای ازدست‌رفته تازه‌بودنش ارزش دارد.
    this.events.broadcast({ type:'shortage.created' });

    return created;
  }


  /**
   * فهرست، با شمارشِ تقاضا برای هر کالا.
   *
   * `timesRequested` همان چیزی است که تصمیمِ خرید را می‌سازد: یک نفر که یک بار
   * چیزی خواسته با دوازده نفر که همان را خواسته‌اند فرق دارد، و بدون این عدد
   * فهرست فقط یک صف بلند است.
   */
  async findAll(q: { status?: string; warehouseId?: string }) {

    const where: Prisma.ProductShortageWhereInput = {
      ...(q.status ? { status: q.status as ProductShortageStatus } : {}),
      ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
    };

    const rows = await this.prisma.productShortage.findMany({
      where,
      orderBy:{ createdAt:'desc' },
      take: 200,
      include:{
        product:{ select:{ id:true, name:true, sku:true } },
        customer:{ select:{ id:true, firstName:true, lastName:true } },
        user:{ select:{ id:true, fullName:true, username:true } },
      },
    });

    // شمارش فقط برای کالاهای کاتالوگ ممکن است؛ تقاضای متن‌آزاد بر اساس نام
    // شمرده می‌شود چون شناسه‌ای ندارد.
    const openByProduct = await this.prisma.productShortage.groupBy({
      by:['productId'],
      where:{ status: ProductShortageStatus.OPEN, productId:{ not: null } },
      _count:{ _all: true },
    });

    const counts = new Map(
      openByProduct.map(r => [r.productId!, r._count._all]),
    );

    return rows.map(r => ({
      ...r,
      timesRequested: r.productId ? (counts.get(r.productId) ?? 1) : 1,
    }));
  }


  async resolve(id: string, dto: ResolveShortageDto, userId?: string) {

    const existing = await this.prisma.productShortage.findUnique({
      where:{ id },
      select:{ id:true },
    });

    if (!existing) {
      throw new NotFoundException({
        error:'SHORTAGE_NOT_FOUND',
        message:'این کسری پیدا نشد',
      });
    }

    const updated = await this.prisma.productShortage.update({
      where:{ id },
      data:{
        status: dto.status as ProductShortageStatus,
        note: dto.note?.trim() || undefined,
        resolvedAt: new Date(),
        resolvedById: userId ?? null,
      },
    });

    this.events.broadcast({ type:'shortage.updated' });

    return updated;
  }
}
