import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { normalizePhone } from '../common/phone.util';


export interface CustomerPhoneInput {
  phone:string;
  label?:string;
  isPrimary?:boolean;
}

export interface CustomerInput {
  firstName:string;
  lastName?:string;
  note?:string;
  smsOptOut?:boolean;
  phones?:CustomerPhoneInput[];
}


@Injectable()
export class CustomersService {

  constructor(private prisma: PrismaService) {}


  /** نام کاملِ نرمال‌شده برای جست‌وجو — «محمّد رضایی» و «محمد رضائی» یکی شوند. */
  private buildSearchName(firstName: string, lastName?: string | null): string {
    return normalizePersian(`${firstName} ${lastName ?? ''}`).trim();
  }


  /**
   * جست‌وجوی مشتری برای صفحه‌ی فروش.
   * روی نام، فامیل و شماره تلفن کار می‌کند. اگر ورودی شبیه شماره باشد، پیش از
   * جست‌وجو نرمال می‌شود تا «۰۹۱۲…» و «+98912…» هم پیدا شوند.
   */
  async search(q?: string, page = 1, pageSize = 50) {

    const where: Prisma.CustomerWhereInput = { isActive: true };

    if (q?.trim()) {
      const normalizedName = normalizePersian(q);

      // شماره‌ی ناقص هم باید پیدا شود («۱۱۱۲۲» وسط تایپ کردن). ارقام فارسی
      // اول انگلیسی می‌شوند. اگر ورودی هیچ رقمی نداشت، شرطِ شماره اصلاً اضافه
      // نمی‌شود — وگرنه `contains: ''` همه‌ی مشتری‌ها را برمی‌گرداند.
      const digits = normalizePersian(q).replace(/\D/g, '');

      where.OR = [
        { searchName:{ contains: normalizedName } },
        { firstName:{ contains: q, mode:'insensitive' } },
        { lastName:{ contains: q, mode:'insensitive' } },
        ...(digits
          ? [{ phones:{ some:{ phone:{ contains: digits } } } }]
          : []),
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include:{ phones:true },
        orderBy:[{ lastName:'asc' }, { firstName:'asc' }],
        skip:(page - 1) * pageSize,
        take:pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: data.map(c => this.withFullName(c)),
      meta:{ total, page, pageSize },
    };
  }


  /** پروفایل مشتری + خلاصه‌ی حساب. مبنای فاز ۶. */
  async findOne(id: string) {

    const customer = await this.prisma.customer.findUnique({
      where:{ id },
      include:{
        phones:{ orderBy:[{ isPrimary:'desc' }, { createdAt:'asc' }] },
        invoices:{
          orderBy:{ createdAt:'desc' },
          take:50,
          select:{
            id:true, number:true, total:true, paidAmount:true,
            dueAmount:true, status:true, createdAt:true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException({
        error:'CUSTOMER_NOT_FOUND',
        message:'مشتری پیدا نشد',
      });
    }

    // مانده‌ی بدهی فقط از فاکتورهای باطل‌نشده.
    const balance = await this.prisma.saleInvoice.aggregate({
      where:{ customerId:id, status:'CONFIRMED' },
      _sum:{ dueAmount:true, total:true },
    });

    return {
      ...this.withFullName(customer),
      summary:{
        totalPurchased: balance._sum.total ?? 0,
        totalDue: balance._sum.dueAmount ?? 0,
      },
    };
  }


  /**
   * ساخت مشتری. فقط نام لازم است — شماره کاملاً اختیاری است، چون باید بشود
   * مشتری را با اسم و فامیل ثبت کرد.
   */
  async create(input: CustomerInput) {

    const firstName = input.firstName?.trim();

    if (!firstName) {
      throw new BadRequestException({
        error:'NAME_REQUIRED',
        message:'نام مشتری الزامی است',
      });
    }

    const phones = this.normalizePhones(input.phones);
    await this.assertPhonesFree(phones.map(p => p.phone));

    const customer = await this.prisma.customer.create({
      data:{
        firstName,
        lastName: input.lastName?.trim() || null,
        searchName: this.buildSearchName(firstName, input.lastName),
        note: input.note ?? null,
        smsOptOut: input.smsOptOut ?? false,
        phones:{ create: phones },
      },
      include:{ phones:true },
    });

    return this.withFullName(customer);
  }


  async update(id: string, input: Partial<CustomerInput>) {

    const current = await this.prisma.customer.findUnique({ where:{ id } });

    if (!current) {
      throw new NotFoundException({
        error:'CUSTOMER_NOT_FOUND',
        message:'مشتری پیدا نشد',
      });
    }

    const firstName = input.firstName?.trim() ?? current.firstName;
    const lastName =
      input.lastName !== undefined
        ? (input.lastName?.trim() || null)
        : current.lastName;

    const updated = await this.prisma.customer.update({
      where:{ id },
      data:{
        firstName,
        lastName,
        searchName: this.buildSearchName(firstName, lastName),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.smsOptOut !== undefined ? { smsOptOut: input.smsOptOut } : {}),
      },
      include:{ phones:true },
    });

    return this.withFullName(updated);
  }


  /** افزودن شماره به بانک شماره‌ی یک مشتری. */
  async addPhone(customerId: string, input: CustomerPhoneInput) {

    await this.findOne(customerId);

    const [normalized] = this.normalizePhones([input]);
    await this.assertPhonesFree([normalized.phone], customerId);

    await this.prisma.customerPhone.create({
      data:{ ...normalized, customerId },
    });

    return this.findOne(customerId);
  }


  async removePhone(customerId: string, phoneId: string) {
    await this.prisma.customerPhone.deleteMany({
      where:{ id: phoneId, customerId },
    });
    return this.findOne(customerId);
  }


  /** Soft Delete (قانون ۵) — رکورد حذف نمی‌شود، غیرفعال می‌شود. */
  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where:{ id },
      data:{ isActive:false },
    });
  }


  // ---------- کمکی‌ها ----------

  private withFullName<T extends { firstName:string; lastName:string | null }>(c: T) {
    return {
      ...c,
      fullName: [c.firstName, c.lastName].filter(Boolean).join(' '),
    };
  }


  /** شماره‌ها نرمال می‌شوند و ورودی نامعتبر رد می‌شود — شماره‌ی خراب ذخیره نشود. */
  private normalizePhones(phones?: CustomerPhoneInput[]) {

    if (!phones?.length) return [];

    const seen = new Set<string>();
    const out: { phone:string; label:string | null; isPrimary:boolean }[] = [];

    for (const p of phones) {
      const normalized = normalizePhone(p.phone);

      if (!normalized) {
        throw new BadRequestException({
          error:'INVALID_PHONE',
          phone: p.phone,
          message:'شماره تلفن معتبر نیست',
        });
      }

      if (seen.has(normalized)) continue; // تکراری در همان درخواست
      seen.add(normalized);

      out.push({
        phone: normalized,
        label: p.label ?? null,
        isPrimary: p.isPrimary ?? out.length === 0,
      });
    }

    return out;
  }


  /** شماره در سطح دیتابیس یکتاست؛ خطای واضح بهتر از خطای Prisma است. */
  private async assertPhonesFree(phones: string[], exceptCustomerId?: string) {

    if (!phones.length) return;

    const taken = await this.prisma.customerPhone.findFirst({
      where:{
        phone:{ in: phones },
        ...(exceptCustomerId ? { customerId:{ not: exceptCustomerId } } : {}),
      },
      include:{ customer:true },
    });

    if (taken) {
      throw new BadRequestException({
        error:'PHONE_ALREADY_USED',
        phone: taken.phone,
        customerId: taken.customerId,
        customerName: [taken.customer.firstName, taken.customer.lastName]
          .filter(Boolean).join(' '),
        message:'این شماره قبلاً برای مشتری دیگری ثبت شده است',
      });
    }
  }
}
