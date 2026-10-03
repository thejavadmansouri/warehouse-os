import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon-admin.dto';

/**
 * مدیریتِ کوپن‌ها — **فقط سرور سایت** (`APP_ROLE=site`).
 *
 * کوپن ابزارِ بازاریابیِ سایت است و در دیتابیسِ سایت زندگی می‌کند.
 * مبالغ به ریال (واحدِ ذخیره) نوشته می‌شوند.
 */
@Injectable()
export class CouponsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async create(dto: CreateCouponDto) {
    const code = dto.code.trim().toUpperCase();

    if (dto.type === CouponType.PERCENT && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException({
        error: 'BAD_PERCENT',
        message: 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد',
      });
    }
    this.assertDateOrder(dto.startsAt, dto.expiresAt);

    try {
      return await this.prisma.coupon.create({
        data: {
          code,
          type: dto.type,
          value: dto.value,
          minSubtotal: dto.minSubtotal ?? 0,
          maxDiscount: dto.maxDiscount ?? null,
          usageLimit: dto.usageLimit ?? null,
          perCustomer: dto.perCustomer ?? null,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          error: 'CODE_TAKEN',
          message: 'این کد قبلاً ساخته شده است',
        });
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException({
        error: 'NOT_FOUND',
        message: 'کوپن یافت نشد',
      });

    if (
      dto.value != null &&
      existing.type === CouponType.PERCENT &&
      (dto.value < 1 || dto.value > 100)
    ) {
      throw new BadRequestException({
        error: 'BAD_PERCENT',
        message: 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد',
      });
    }
    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
          ? new Date(dto.startsAt)
          : null
        : existing.startsAt;
    const expiresAt =
      dto.expiresAt !== undefined
        ? dto.expiresAt
          ? new Date(dto.expiresAt)
          : null
        : existing.expiresAt;
    this.assertDateOrder(startsAt, expiresAt);

    return this.prisma.coupon.update({
      where: { id },
      data: {
        value: dto.value ?? undefined,
        minSubtotal: dto.minSubtotal ?? undefined,
        maxDiscount:
          dto.maxDiscount !== undefined ? dto.maxDiscount : undefined,
        usageLimit: dto.usageLimit !== undefined ? dto.usageLimit : undefined,
        perCustomer:
          dto.perCustomer !== undefined ? dto.perCustomer : undefined,
        startsAt,
        expiresAt,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.coupon.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found)
      throw new NotFoundException({
        error: 'NOT_FOUND',
        message: 'کوپن یافت نشد',
      });
    // سفارش‌های قبلی couponCode را snapshot دارند؛ FK با ON DELETE SET NULL می‌ماند.
    await this.prisma.coupon.delete({ where: { id } });
    return { ok: true };
  }

  private assertDateOrder(
    startsAt?: Date | string | null,
    expiresAt?: Date | string | null,
  ) {
    if (startsAt && expiresAt && new Date(startsAt) > new Date(expiresAt)) {
      throw new BadRequestException({
        error: 'BAD_DATES',
        message: 'تاریخ شروع نمی‌تواند بعد از تاریخ انقضا باشد',
      });
    }
  }
}
