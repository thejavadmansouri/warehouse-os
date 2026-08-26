import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateShippingZoneDto, UpdateShippingZoneDto } from './dto/shipping-zone-admin.dto';

/** مدیریتِ مناطقِ ارسال — **فقط سرور سایت** (`APP_ROLE=site`). مبالغ به ریال. */
@Injectable()
export class ShippingZonesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.shippingZone.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(dto: CreateShippingZoneDto) {
    return this.prisma.shippingZone.create({
      data: {
        name: dto.name.trim(),
        fee: dto.fee,
        freeOver: dto.freeOver ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateShippingZoneDto) {
    await this.mustExist(id);
    return this.prisma.shippingZone.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        fee: dto.fee ?? undefined,
        freeOver: dto.freeOver !== undefined ? dto.freeOver : undefined,
        sortOrder: dto.sortOrder ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async remove(id: string) {
    await this.mustExist(id);
    // سفارش‌های قبلی shippingFee را snapshot دارند؛ FK با ON DELETE SET NULL می‌ماند.
    await this.prisma.shippingZone.delete({ where: { id } });
    return { ok: true };
  }

  private async mustExist(id: string) {
    const z = await this.prisma.shippingZone.findUnique({ where: { id }, select: { id: true } });
    if (!z) throw new NotFoundException({ error: 'NOT_FOUND', message: 'منطقه یافت نشد' });
    return z;
  }
}
