import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';


export interface CreateReceiptInput {
  idempotencyKey?: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  cheque?: {
    number: string;
    bankName?: string;
    branch?: string;
    holderName?: string;
    dueDate: string;
  };
}


@Injectable()
export class ReceiptsService {

  constructor(private prisma: PrismaService) {}


  /**
   * ثبت دریافت وجه از مشتری بابت بدهی قبلی.
   *
   * پول به **قدیمی‌ترین فاکتور بدهکار اول** تخصیص داده می‌شود و تا جایی که
   * مبلغ برسد جلو می‌رود. هر تخصیص جداگانه ثبت می‌شود، پس بعداً می‌شود گفت
   * کدام بخش از پول بابت کدام فاکتور بوده — «مانده‌ی مشتری» عددی نیست که
   * کسی نتواند ازش دفاع کند.
   *
   * موجودی و لجر انبار اصلاً درگیر نمی‌شوند؛ این یک حرکت مالی است نه انبار.
   */
  async create(input: CreateReceiptInput, userId?: string) {

    if (!input.amount || input.amount <= 0) {
      throw new BadRequestException({
        error: 'INVALID_AMOUNT',
        message: 'مبلغ دریافتی باید بزرگ‌تر از صفر باشد',
      });
    }

    // نسیه یعنی «پول ندادم» — به‌عنوان روش دریافت بی‌معناست.
    if (input.method === PaymentMethod.CREDIT) {
      throw new BadRequestException({
        error: 'INVALID_METHOD',
        message: 'نسیه روش دریافت وجه نیست',
      });
    }

    if (input.method === PaymentMethod.CHEQUE && !input.cheque) {
      throw new BadRequestException({
        error: 'CHEQUE_DETAILS_REQUIRED',
        message: 'برای دریافت چکی، مشخصات چک الزامی است',
      });
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.receipt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return this.findOne(existing.id);
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const receiptId = await this.prisma.$transaction(async (tx) => {

      // قدیمی‌ترین اول — همان چیزی که در مغازه اتفاق می‌افتد.
      const debts = await tx.saleInvoice.findMany({
        where: {
          customerId: input.customerId,
          status: 'CONFIRMED',
          dueAmount: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, dueAmount: true, paidAmount: true },
      });

      const totalDebt = debts.reduce((s, d) => s + d.dueAmount, 0);

      if (totalDebt === 0) {
        throw new BadRequestException({
          error: 'NO_DEBT',
          message: 'این مشتری بدهی ثبت‌شده‌ای ندارد',
        });
      }

      // بیش از بدهی نپذیر. پیش‌دریافت مفهوم جداگانه‌ای است و اگر اینجا
      // قاطی شود، «مانده‌ی مشتری» دیگر قابل اتکا نیست.
      if (input.amount > totalDebt) {
        throw new BadRequestException({
          error: 'AMOUNT_EXCEEDS_DEBT',
          amount: input.amount,
          totalDebt,
          message: `مبلغ دریافتی از کل بدهی مشتری بیشتر است (بدهی: ${totalDebt})`,
        });
      }

      const receipt = await tx.receipt.create({
        data: {
          customerId: input.customerId,
          userId: userId ?? null,
          amount: input.amount,
          method: input.method,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      if (input.method === PaymentMethod.CHEQUE && input.cheque) {
        await tx.cheque.create({
          data: {
            receiptId: receipt.id,
            number: input.cheque.number,
            bankName: input.cheque.bankName ?? null,
            branch: input.cheque.branch ?? null,
            holderName: input.cheque.holderName ?? null,
            dueDate: new Date(input.cheque.dueDate),
          },
        });
      }

      let remaining = input.amount;

      for (const debt of debts) {
        if (remaining <= 0) break;

        const applied = Math.min(remaining, debt.dueAmount);

        await tx.receiptAllocation.create({
          data: { receiptId: receipt.id, invoiceId: debt.id, amount: applied },
        });

        await tx.saleInvoice.update({
          where: { id: debt.id },
          data: {
            paidAmount: debt.paidAmount + applied,
            dueAmount: debt.dueAmount - applied,
          },
        });

        remaining -= applied;
      }

      return receipt.id;
    });

    return this.findOne(receiptId);
  }


  async findOne(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, fullName: true } },
        cheque: true,
        allocations: {
          include: { invoice: { select: { id: true, number: true, total: true } } },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException({
        error: 'RECEIPT_NOT_FOUND',
        message: 'رسید پیدا نشد',
      });
    }

    return {
      ...receipt,
      customerName: [receipt.customer.firstName, receipt.customer.lastName]
        .filter(Boolean)
        .join(' '),
    };
  }


  async findAll(q: { customerId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));

    const where = q.customerId ? { customerId: q.customerId } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.receipt.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          user: { select: { fullName: true } },
          cheque: { select: { number: true, dueDate: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.receipt.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        ...r,
        customerName: [r.customer.firstName, r.customer.lastName]
          .filter(Boolean)
          .join(' '),
      })),
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
