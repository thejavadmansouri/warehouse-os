import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';

export type SupplierInput = {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
  creditDays?: number;
  preferredPayMethod?: PaymentMethod | null;
  bankName?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
};

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    @Optional() private realtime?: EventsGateway,
  ) {}

  private announce<T extends { id: string }>(s: T): T {
    this.realtime?.broadcast({ type: 'supplier.changed', supplierId: s.id });
    return s;
  }

  findAll() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) {
      throw new NotFoundException({
        error: 'SUPPLIER_NOT_FOUND',
        message: 'تأمین‌کننده پیدا نشد',
      });
    }
    return s;
  }

  async create(dto: SupplierInput) {
    const name = dto.name?.trim();
    if (!name || name.length < 2) {
      throw new BadRequestException({
        error: 'SUPPLIER_NAME_REQUIRED',
        message: 'نام تأمین‌کننده لازم است',
      });
    }
    return this.announce(
      await this.prisma.supplier.create({
        data: this.toData(dto, name),
      }),
    );
  }

  async update(id: string, dto: Partial<SupplierInput>) {
    await this.findOne(id);
    const name = dto.name !== undefined ? dto.name.trim() : undefined;
    if (name !== undefined && name.length < 2) {
      throw new BadRequestException({
        error: 'SUPPLIER_NAME_REQUIRED',
        message: 'نام تأمین‌کننده لازم است',
      });
    }
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.contactName !== undefined
          ? { contactName: dto.contactName?.trim() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.address !== undefined
          ? { address: dto.address?.trim() || null }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.creditDays !== undefined
          ? { creditDays: Math.max(0, Math.floor(dto.creditDays || 0)) }
          : {}),
        ...(dto.preferredPayMethod !== undefined
          ? { preferredPayMethod: dto.preferredPayMethod }
          : {}),
        ...(dto.bankName !== undefined
          ? { bankName: dto.bankName?.trim() || null }
          : {}),
        ...(dto.bankAccount !== undefined
          ? { bankAccount: dto.bankAccount?.trim() || null }
          : {}),
        ...(dto.iban !== undefined ? { iban: dto.iban?.trim() || null } : {}),
      },
    });
    return this.announce(updated);
  }

  private toData(dto: SupplierInput, name: string) {
    return {
      name,
      contactName: dto.contactName?.trim() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      note: dto.note?.trim() || null,
      creditDays: Math.max(0, Math.floor(dto.creditDays ?? 0)),
      preferredPayMethod: dto.preferredPayMethod ?? null,
      bankName: dto.bankName?.trim() || null,
      bankAccount: dto.bankAccount?.trim() || null,
      iban: dto.iban?.trim() || null,
    };
  }
}
