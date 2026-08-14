import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { normalizePersian } from '../engine/utils/persian-normalize';
import { normalizePhone } from '../common/phone.util';
import { LedgerService } from './ledger.service';
import { CustomerCategoriesService } from './customer-categories.service';
import { CreateCustomerDto, CustomerPhoneDto } from './dto/customer.dto';


/*
 * شکلِ ورودی از خودِ DTOها می‌آید. تعریفِ موازی یعنی چیزی که ValidationPipe
 * می‌بیند با چیزی که سرویس انتظار دارد می‌توانند از هم جدا بیفتند.
 */
export type CustomerPhoneInput = CustomerPhoneDto;
export type CustomerInput = CreateCustomerDto;

/** مرتب‌سازی فهرست مشتریان. `due*` روی مانده‌ی دفتر کار می‌کند. */
export type CustomerSort = 'name' | 'newest' | 'dueDesc' | 'dueAsc';

const CUSTOMER_SORTS: readonly CustomerSort[] = ['name', 'newest', 'dueDesc', 'dueAsc'];


@Injectable()
export class CustomersService {

  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private categories: CustomerCategoriesService,
  ) {}


  /** نام کاملِ نرمال‌شده برای جست‌وجو — «محمّد رضایی» و «محمد رضائی» یکی شوند. */
  private buildSearchName(firstName: string, lastName?: string | null): string {
    return normalizePersian(`${firstName} ${lastName ?? ''}`).trim();
  }


  /**
   * جست‌وجوی مشتری برای صفحه‌ی فروش.
   * روی نام، فامیل و شماره تلفن کار می‌کند. اگر ورودی شبیه شماره باشد، پیش از
   * جست‌وجو نرمال می‌شود تا «۰۹۱۲…» و «+98912…» هم پیدا شوند.
   *
   * `sortBy` روی مانده‌ی دفتر (`SUM(amount)`) کار می‌کند. چون مانده ستونی در
   * خودِ Customer نیست، مرتب‌سازیِ بر اساس بدهی در حافظه انجام می‌شود: اول همه‌ی
   * idهای منطبق گرفته می‌شود، مانده‌شان با یک groupByِ ایندکس‌شده روی
   * `customerLedger.customerId` می‌آید، و بعد صفحه بریده می‌شود. تعداد مشتری‌ها
   * در مقیاس این سیستم کم است؛ برایِ جدولِ ۱۰۰هزار ردیفی دفتر، ستون کشِ مانده
   * راه‌حلِ درست است (همان چیزی که در گزارش سرعت هم گفته شد).
   */
  async search(
    q?: string,
    page = 1,
    pageSize = 50,
    sortBy: CustomerSort = 'name',
    categoryId?: string,
  ) {

    const sort = (CUSTOMER_SORTS as readonly string[]).includes(sortBy)
      ? sortBy
      : 'name';

    const where: Prisma.CustomerWhereInput = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    };

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

    const total = await this.prisma.customer.count({ where });

    /*
     * مرتب‌سازی بر اساس مانده: کلِ مجموعه‌ی منطبق مرتب می‌شود و بعد صفحه بریده
     * می‌شود — وگرنه ترتیبِ صفحه‌ها درست از آب درنمی‌آمد. هم‌نام‌ها با نام
     * کامل از هم جدا می‌شوند تا ترتیبِ صفحه‌ها ثابت بماند.
     */
    if (sort === 'dueDesc' || sort === 'dueAsc') {
      const matched = await this.prisma.customer.findMany({
        where,
        select:{ id:true, firstName:true, lastName:true },
      });

      const groups = matched.length
        ? await this.prisma.customerLedger.groupBy({
            by:['customerId'],
            where:{ customerId:{ in: matched.map(m => m.id) } },
            _sum:{ amount:true },
          })
        : [];
      const balances = new Map(
        groups.map(g => [g.customerId, g._sum.amount ?? 0]),
      );

      const ordered = matched
        .map(m => ({
          id: m.id,
          due: balances.get(m.id) ?? 0,
          fullName: [m.firstName, m.lastName].filter(Boolean).join(' '),
        }))
        .sort((a, b) =>
          sort === 'dueDesc'
            ? b.due - a.due || a.fullName.localeCompare(b.fullName, 'fa')
            : a.due - b.due || a.fullName.localeCompare(b.fullName, 'fa')
        );

      const slice = ordered.slice((page - 1) * pageSize, page * pageSize);
      const customers = slice.length
        ? await this.prisma.customer.findMany({
            where:{ id:{ in: slice.map(s => s.id) } },
            include:{ phones:true, category:true },
          })
        : [];
      const byId = new Map(customers.map(c => [c.id, c]));

      return {
        data: slice
          .map(s => byId.get(s.id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map(c => ({
            ...this.withFullName(c),
            summary:{ totalDue: balances.get(c.id) ?? 0 },
          })),
        meta: this.meta(total, page, pageSize),
      };
    }

    const orderBy =
      sort === 'newest'
        ? { createdAt:'desc' as const }
        : [{ lastName:'asc' as const }, { firstName:'asc' as const }];

    const data = await this.prisma.customer.findMany({
      where,
      include:{ phones:true, category:true },
      orderBy,
      skip:(page - 1) * pageSize,
      take:pageSize,
    });

    /*
     * مانده‌ی مشتری‌های همین صفحه — یک groupBy با `customerId in (...)` که از
     * ایندکس `[customerId, createdAt]` استفاده می‌کند، نه یک کوئری به‌ازای هر
     * مشتری. عددِ ستون «بدهی» از همین‌جا می‌آید.
     */
    const pageIds = data.map(c => c.id);
    const groups = pageIds.length
      ? await this.prisma.customerLedger.groupBy({
          by:['customerId'],
          where:{ customerId:{ in: pageIds } },
          _sum:{ amount:true },
        })
      : [];
    const balances = new Map(groups.map(g => [g.customerId, g._sum.amount ?? 0]));

    return {
      data: data.map(c => ({
        ...this.withFullName(c),
        summary:{ totalDue: balances.get(c.id) ?? 0 },
      })),
      meta: this.meta(total, page, pageSize),
    };
  }


  /** پروفایل مشتری + خلاصه‌ی حساب. مبنای فاز ۶. */
  async findOne(id: string) {

    const customer = await this.prisma.customer.findUnique({
      where:{ id },
      include:{
        category:true,
        phones:{ orderBy:[{ isPrimary:'desc' }, { createdAt:'asc' }] },
        invoices:{
          orderBy:{ createdAt:'desc' },
          take:50,
          select:{
            id:true, number:true, total:true, paidAmount:true,
            dueAmount:true, dueDate:true, status:true, createdAt:true,
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

    /*
     * مانده از دفتر می‌آید، نه از جمعِ `dueAmount` فاکتورها.
     *
     * جمعِ فاکتورها مانده‌ی اول دوره، برگشتی و چک برگشتی را نمی‌بیند — یعنی
     * برای مشتریِ قدیمی عددِ کمتری نشان می‌داد. «مبلغ کل خرید» اما همچنان از
     * فاکتورهاست، چون واقعاً خاصیتِ فروش است نه حرکتِ حساب.
     */
    const [summary, purchased] = await Promise.all([
      this.ledger.summary(id),
      this.prisma.saleInvoice.aggregate({
        where:{ customerId:id, status:'CONFIRMED' },
        _sum:{ total:true },
      }),
    ]);

    return {
      ...this.withFullName(customer),
      summary:{
        totalPurchased: purchased._sum.total ?? 0,
        ...summary,
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

    // دسته باید موجود و فعال باشد — رشته‌ی آزاد دیگر پذیرفته نمی‌شود.
    const categoryId = input.categoryId
      ? (await this.categories.assertActive(input.categoryId)).id
      : null;

    const customer = await this.prisma.customer.create({
      data:{
        firstName,
        lastName: input.lastName?.trim() || null,
        searchName: this.buildSearchName(firstName, input.lastName),
        address: input.address?.trim() || null,
        nationalId: input.nationalId?.trim() || null,
        categoryId,
        note: input.note ?? null,
        smsOptOut: input.smsOptOut ?? false,
        creditLimit: input.creditLimit ?? 0,
        creditDays: input.creditDays ?? 0,
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

    // null یعنی «بدون دسته» — رشته‌ی خالی هم به null تبدیل می‌شود.
    let categoryId: string | null | undefined;
    if (input.categoryId !== undefined) {
      categoryId = input.categoryId
        ? (await this.categories.assertActive(input.categoryId)).id
        : null;
    }

    const updated = await this.prisma.customer.update({
      where:{ id },
      data:{
        firstName,
        lastName,
        searchName: this.buildSearchName(firstName, lastName),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.nationalId !== undefined ? { nationalId: input.nationalId?.trim() || null } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.smsOptOut !== undefined ? { smsOptOut: input.smsOptOut } : {}),
        ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
        ...(input.creditDays !== undefined ? { creditDays: input.creditDays } : {}),
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


  /**
   * تعیین شماره‌ی اصلی. در یک تراکنش: شماره‌ی انتخاب‌شده اصلی می‌شود و بقیه‌ی
   * شماره‌های همین مشتری غیراصلی — وگرنه دو شماره‌ی اصلی کنار هم می‌نشستند و
   * «شماره‌ی اصلی» دیگر معنایی نداشت.
   */
  async setPrimaryPhone(customerId: string, phoneId: string) {
    await this.findOne(customerId);

    const target = await this.prisma.customerPhone.findFirst({
      where:{ id: phoneId, customerId },
    });

    if (!target) {
      throw new NotFoundException({
        error:'PHONE_NOT_FOUND',
        message:'این شماره برای این مشتری یافت نشد',
      });
    }

    await this.prisma.$transaction([
      this.prisma.customerPhone.updateMany({
        where:{ customerId },
        data:{ isPrimary:false },
      }),
      this.prisma.customerPhone.update({
        where:{ id: phoneId },
        data:{ isPrimary:true },
      }),
    ]);

    return this.findOne(customerId);
  }


  /**
   * Soft Delete (قانون ۵) — رکورد حذف نمی‌شود، غیرفعال می‌شود.
   *
   * مشتریِ دارای مانده غیرفعال نمی‌شود. گزارش بدهکاران و مطالبات روی
   * `isActive` فیلتر می‌کنند، پس غیرفعال‌کردنِ یک بدهکار طلبش را از همه‌ی
   * جمع‌های مالی ناپدید می‌کرد در حالی که ردیف‌های دفترش سرِ جایشان بودند —
   * پول از گزارش می‌رفت بی‌آنکه کسی چیزی ببیند. اول تسویه، بعد غیرفعال‌سازی.
   */
  async deactivate(id: string) {
    await this.findOne(id);

    const balance = await this.ledger.balance(id);

    if (balance !== 0) {
      throw new BadRequestException({
        error:'CUSTOMER_HAS_BALANCE',
        balance,
        message:
          balance > 0
            ? 'این مشتری هنوز بدهی دارد — تا تسویه نشود نمی‌توان غیرفعالش کرد'
            : 'این مشتری بستانکار است — تا تسویه نشود نمی‌توان غیرفعالش کرد',
      });
    }

    return this.prisma.customer.update({
      where:{ id },
      data:{ isActive:false },
    });
  }


  // ---------- کمکی‌ها ----------

  private meta(total: number, page: number, pageSize: number) {
    return { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /**
   * آمار خرید دوره‌ای — جمع و تعداد فاکتورهای تأییدشده در این ماه، ماه قبل،
   * و کل، به‌علاوه‌ی میانگین هر فاکتور.
   *
   * عمداً از فاکتورها حساب می‌شود نه دفتر: این «خاصیتِ فروش» است، نه حرکتِ
   * حساب (مانده‌ی اول دوره و برگشتی را نمی‌خواهد).
   */
  async purchaseStats(id: string) {
    await this.findOne(id);

    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const confirmed = {
      status: 'CONFIRMED' as const,
      customerId: id,
    };

    const [thisMonth, lastMonth, allTime] = await Promise.all([
      this.prisma.saleInvoice.aggregate({
        where:{ ...confirmed, createdAt:{ gte: startThisMonth, lt: startNextMonth } },
        _sum:{ total:true },
        _count:true,
      }),
      this.prisma.saleInvoice.aggregate({
        where:{ ...confirmed, createdAt:{ gte: startLastMonth, lt: startThisMonth } },
        _sum:{ total:true },
        _count:true,
      }),
      this.prisma.saleInvoice.aggregate({
        where: confirmed,
        _sum:{ total:true },
        _count:true,
      }),
    ]);

    const allCount = allTime._count;

    return {
      thisMonth:{
        total: thisMonth._sum.total ?? 0,
        count: thisMonth._count,
      },
      lastMonth:{
        total: lastMonth._sum.total ?? 0,
        count: lastMonth._count,
      },
      allTime:{
        total: allTime._sum.total ?? 0,
        count: allCount,
      },
      /** میانگین مبلغ هر فاکتور تأییدشده — صفر وقتی هنوز فاکتوری نیست. */
      averageInvoice: allCount > 0 ? Math.round((allTime._sum.total ?? 0) / allCount) : 0,
    };
  }


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
