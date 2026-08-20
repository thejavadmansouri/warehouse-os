import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, WorkTaskStatus, WorkTaskItemStatus, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { WorkTasksGateway } from './work-tasks.gateway';

export interface CreateWorkTaskLine {
  productId: string;
  /** اختیاری — مثل PickTask: جنس ثبت‌نشده آدرس ندارد ولی کارگر پیدایش می‌کند. */
  locationId?: string;
  quantity: number;
}

export interface SyncMutation {
  clientMutationId: string;
  taskId: string;
  itemId: string;
}

const SUMMARY_INCLUDE = {
  _count: { select: { items: true } },
  // فقط برای شمارشِ done — ردیف کامل لازم نیست، ولی `status` حتماً باید بیاید:
  // toTaskDto با `filter(i => i.status === DONE)` می‌شمارد و بدون status همیشه صفر می‌شود.
  items: { where: { status: WorkTaskItemStatus.DONE }, select: { id: true, status: true } },
  invoice: { select: { number: true } },
  quotation: { select: { number: true } },
  requestedBy: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.WorkTaskInclude;

const DETAIL_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true, internalBarcode: true } },
      location: { select: { id: true, name: true, code: true, barcode: true, path: true } },
      doneBy: { select: { id: true, fullName: true } },
    },
  },
  invoice: { select: { number: true } },
  quotation: { select: { number: true } },
  requestedBy: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.WorkTaskInclude;

/**
 * «کارِ کارگر» با پیشرفت زنده — POS می‌فرستد، کارگر تیک می‌زند، مدیر درصد را می‌بیند.
 *
 * عمداً **هیچ تماسی با موجودی ندارد**: نه کسر، نه رزرو، نه حرکتِ لجر. فقط یک
 * تابلوی کار. `doneItems/totalItems` همیشه از آیتم‌ها مشتق می‌شود، ستون جدا
 * نمی‌شود تا منبعِ دروغ درست نشود.
 */
@Injectable()
export class WorkTasksService {
  constructor(
    private prisma: PrismaService,
    private gateway: WorkTasksGateway,
    private events: EventsGateway,
  ) {}

  /** فروشنده/مدیر یک Task با چند قلم می‌سازد — موجودی دست نمی‌خورد. */
  async create(
    input: {
      warehouseId: string;
      lines: CreateWorkTaskLine[];
      invoiceId?: string;
      quotationId?: string;
      assignedToId?: string | null;
      note?: string;
      idempotencyKey?: string;
    },
    requestedById?: string,
  ) {
    if (!input.lines?.length) {
      throw new BadRequestException({
        error: 'NO_LINES',
        message: 'حداقل یک کالا باید انتخاب شود',
      });
    }
    input.lines.forEach((l, i) => {
      if (!l.quantity || l.quantity <= 0) {
        throw new BadRequestException({
          error: 'INVALID_QUANTITY',
          lineIndex: i,
          message: 'تعداد باید بزرگ‌تر از صفر باشد',
        });
      }
    });

    // ارسال دوباره (دبل‌کلیک یا retry شبکه) Task تکراری نمی‌سازد.
    if (input.idempotencyKey) {
      const existing = await this.prisma.workTask.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) return this.findOne(existing.id);
    }

    const task = await this.prisma.workTask.create({
      data: {
        warehouseId: input.warehouseId,
        invoiceId: input.invoiceId ?? null,
        quotationId: input.quotationId ?? null,
        assignedToId: input.assignedToId ?? null,
        requestedById: requestedById ?? null,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        items: {
          create: input.lines.map((l) => ({
            productId: l.productId,
            locationId: l.locationId ?? null,
            quantity: l.quantity,
          })),
        },
      },
    });

    // همان لحظه به گوشی کارگر push — تخصیص‌داده‌شده فقط برای همان کارگر،
    // «هر کارگری» برای همه‌ی اتصال‌های زنده. اپ گوشی با این پیام فوراً تازه می‌شود.
    this.gateway.emitCreated([task.id], input.assignedToId);
    // POS هم لیستش را تازه کند (پیشرفت ۰٪ در ابتدا).
    this.events.broadcast({ type: 'work-task.progress', taskId: task.id });

    return this.findOne(task.id);
  }

  /** صف کارهای کارگر — تخصیصی به خودش + بدون‌تخصیص؛ لغوشده‌ها دیده نمی‌شوند. */
  async findForWorker(userId: string, warehouseId?: string) {
    const tasks = await this.prisma.workTask.findMany({
      where: {
        status: { not: WorkTaskStatus.CANCELLED },
        ...(warehouseId ? { warehouseId } : {}),
        OR: [{ assignedToId: null }, { assignedToId: userId }],
      },
      include: SUMMARY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((t) => this.toTaskDto(t));
  }

  /** نمای فروشنده/مدیر روی همه‌ی کارها + پیشرفت. */
  async findMany(filter: {
    status?: WorkTaskStatus;
    warehouseId?: string;
    invoiceId?: string;
  }) {
    const where: Prisma.WorkTaskWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.warehouseId) where.warehouseId = filter.warehouseId;
    if (filter.invoiceId) where.invoiceId = filter.invoiceId;

    const tasks = await this.prisma.workTask.findMany({
      where,
      include: SUMMARY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((t) => this.toTaskDto(t));
  }

  /** جزئیات کامل یک Task. کارگر فقط کارِ خودش/بدون‌تخصیص را می‌بیند. */
  async findOne(id: string, viewer?: { userId: string; role: Role }) {
    const task = await this.prisma.workTask.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!task) {
      throw new NotFoundException({
        error: 'WORK_TASK_NOT_FOUND',
        message: 'کار پیدا نشد',
      });
    }
    // کارگر نباید کارِ تخصیص‌یافته به دیگری یا کارِ لغوشده را ببیند.
    if (viewer?.role === Role.STAFF) {
      const visible =
        task.status !== WorkTaskStatus.CANCELLED &&
        (task.assignedToId === null || task.assignedToId === viewer.userId);
      if (!visible) {
        throw new NotFoundException({
          error: 'WORK_TASK_NOT_FOUND',
          message: 'کار پیدا نشد',
        });
      }
    }
    return this.toTaskDto(task, { withItems: true });
  }

  /**
   * تیک‌های آفلاین کارگر — batch از outbox گوشی می‌آید.
   *
   * هر قلم ادعای اتمیک دارد: `updateMany where status=PENDING` — دو کارگرِ
   * هم‌زمان روی Taskِ بدون‌تخصیص نمی‌توانند یک قلم را دو بار بزنند. `clientMutationId`
   * همان تیک را idempotent می‌کند: تکرارِ sync (شبکه‌ی قطع‌ووصل) «موفق» برمی‌گردد
   * و صفِ گوشی پاک می‌شود — نه خطا.
   */
  async syncMutations(userId: string, mutations: SyncMutation[]) {
    if (!mutations?.length) {
      throw new BadRequestException({
        error: 'NO_MUTATIONS',
        message: 'هیچ تیکی ارسال نشده',
      });
    }

    const results: Array<{
      clientMutationId: string;
      taskId: string;
      itemId: string;
      status: 'OK' | 'ALREADY_DONE' | 'TASK_CANCELLED' | 'TASK_NOT_VISIBLE' | 'ITEM_NOT_FOUND';
    }> = [];
    const affectedTaskIds = new Set<string>();

    for (const m of mutations) {
      const item = await this.prisma.workTaskItem.findUnique({
        where: { id: m.itemId },
        include: { task: true },
      });

      if (!item || item.taskId !== m.taskId) {
        results.push({ ...m, status: 'ITEM_NOT_FOUND' });
        continue;
      }

      const task = item.task;
      if (task.status === WorkTaskStatus.CANCELLED) {
        results.push({ ...m, status: 'TASK_CANCELLED' });
        continue;
      }
      if (task.assignedToId !== null && task.assignedToId !== userId) {
        results.push({ ...m, status: 'TASK_NOT_VISIBLE' });
        continue;
      }

      // قبلاً DONE شده؟ همان کلید → پخشِ دوباره (OK)؛ کلیدِ دیگر → دیگری برده.
      if (item.status === WorkTaskItemStatus.DONE) {
        results.push({
          ...m,
          status: item.clientMutationId === m.clientMutationId ? 'OK' : 'ALREADY_DONE',
        });
        continue;
      }

      // ادعای اتمیک — اگر race ببازیم و قلم را دیگری برده، DONE می‌بینیم و دوباره چک می‌کنیم.
      const claimed = await this.prisma.workTaskItem.updateMany({
        where: { id: m.itemId, status: WorkTaskItemStatus.PENDING },
        data: {
          status: WorkTaskItemStatus.DONE,
          doneById: userId,
          doneAt: new Date(),
          clientMutationId: m.clientMutationId,
        },
      });
      if (claimed.count === 1) {
        results.push({ ...m, status: 'OK' });
        affectedTaskIds.add(m.taskId);
      } else {
        const now = await this.prisma.workTaskItem.findUnique({ where: { id: m.itemId } });
        results.push({
          ...m,
          status: now?.clientMutationId === m.clientMutationId ? 'OK' : 'ALREADY_DONE',
        });
        if (now?.clientMutationId === m.clientMutationId) affectedTaskIds.add(m.taskId);
      }
    }

    // وضعیت هر Taskِ دست‌خورده را بازمحاسبه کن و progress را push کن.
    for (const taskId of affectedTaskIds) {
      await this.refreshStatusAndNotify(taskId);
    }

    return { results };
  }

  async cancel(id: string, reason?: string) {
    const claimed = await this.prisma.workTask.updateMany({
      where: { id, status: { in: [WorkTaskStatus.PENDING, WorkTaskStatus.IN_PROGRESS] } },
      data: {
        status: WorkTaskStatus.CANCELLED,
        cancelReason: reason ?? null,
        cancelledAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.workTask.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!current) {
        throw new NotFoundException({
          error: 'WORK_TASK_NOT_FOUND',
          message: 'کار پیدا نشد',
        });
      }
      throw new ConflictException({
        error: 'NOT_CANCELLABLE',
        status: current.status,
        message:
          current.status === WorkTaskStatus.COMPLETED
            ? 'این کار تمام شده — قابل لغو نیست'
            : 'این کار قبلاً لغو شده است',
      });
    }
    const task = await this.findOne(id);
    this.gateway.emitCancelled([id], task.assignedToId);
    this.events.broadcast({ type: 'work-task.progress', taskId: id });
    return task;
  }

  /** PENDING → IN_PROGRESS → COMPLETED بر اساس تیک‌ها + push پیشرفت به همه. */
  private async refreshStatusAndNotify(taskId: string) {
    const grouped = await this.prisma.workTaskItem.groupBy({
      by: ['status'],
      where: { taskId },
      _count: { _all: true },
    });
    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    const done = grouped.find((g) => g.status === WorkTaskItemStatus.DONE)?._count._all ?? 0;

    let next: WorkTaskStatus;
    if (done >= total && total > 0) next = WorkTaskStatus.COMPLETED;
    else if (done > 0) next = WorkTaskStatus.IN_PROGRESS;
    else next = WorkTaskStatus.PENDING;

    // فقط جلو می‌رود — هیچ‌وقت وضعیت را به عقب برنمی‌گرداند.
    await this.prisma.workTask.updateMany({
      where: {
        id: taskId,
        ...(next === WorkTaskStatus.COMPLETED
          ? { status: { in: [WorkTaskStatus.PENDING, WorkTaskStatus.IN_PROGRESS] } }
          : { status: { not: next } }),
      },
      data: { status: next },
    });

    this.events.broadcast({ type: 'work-task.progress', taskId });
  }

  private toTaskDto(task: any, opts: { withItems?: boolean } = {}) {
    const allItems = task.items ?? [];
    const doneItems = allItems.filter(
      (i: any) => i.status === WorkTaskItemStatus.DONE,
    ).length;
    const totalItems = task._count?.items ?? allItems.length;

    return {
      id: task.id,
      status: task.status,
      warehouseId: task.warehouseId,
      invoiceId: task.invoiceId,
      quotationId: task.quotationId,
      assignedToId: task.assignedToId,
      note: task.note,
      cancelReason: task.cancelReason,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      doneItems,
      totalItems,
      invoice: task.invoice ? { number: task.invoice.number } : null,
      quotation: task.quotation ? { number: task.quotation.number } : null,
      requestedBy: task.requestedBy ?? null,
      assignedTo: task.assignedTo ?? null,
      items: opts.withItems ? allItems.map(this.toItemDto) : undefined,
    };
  }

  private toItemDto(item: any) {
    return {
      id: item.id,
      taskId: item.taskId,
      status: item.status,
      productId: item.productId,
      locationId: item.locationId,
      quantity: item.quantity,
      doneById: item.doneById,
      doneAt: item.doneAt,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            sku: item.product.sku,
            unit: item.product.unit,
          }
        : null,
      location: item.location
        ? {
            id: item.location.id,
            name: item.location.name,
            code: item.location.code,
            barcode: item.location.barcode,
            path: item.location.path,
          }
        : null,
      doneBy: item.doneBy ?? null,
    };
  }
}
