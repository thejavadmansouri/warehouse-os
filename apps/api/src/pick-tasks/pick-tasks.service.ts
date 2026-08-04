import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, PickTaskStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PickTasksGateway } from './pick-tasks.gateway';


export interface CreatePickTaskLine {
  productId:string;
  locationId:string;
  quantity:number;
  note?:string;
}


@Injectable()
export class PickTasksService {

  constructor(
    private prisma: PrismaService,
    private gateway: PickTasksGateway,
  ) {}


  /**
   * فهرست کارگرها برای انتخاب گیرنده‌ی کار برداشت.
   *
   * فروشنده و مدیر باید بتوانند کار را «به نامِ» یک کارگر مشخص بفرستند، پس
   * لازم است اسم کارگرها را ببینند. GET /users فقط برای ادمین است و نباید
   * برای این کار باز شود؛ اینجا فقط id و نام برگردانده می‌شود، نه چیز حساسی.
   */
  listWorkers() {
    return this.prisma.user.findMany({
      where: { role: 'STAFF' },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: 'asc' },
    });
  }


  /**
   * فروشنده لوکیشن یک یا چند کالا را برای کارگر می‌فرستد.
   *
   * هیچ تغییری در موجودی نمی‌دهد — این فقط یک تابلوی کار است. اگر کارگر جنس
   * را بیاورد ولی فروش نهایی نشود، هیچ عدد اشتباهی در انبار ثبت نشده.
   */
  async create(
    input: {
      warehouseId:string;
      lines:CreatePickTaskLine[];
      invoiceId?:string;
      assignedToId?:string;
    },
    requestedById?: string,
  ) {

    if (!input.lines?.length) {
      throw new BadRequestException({
        error:'NO_LINES',
        message:'حداقل یک کالا باید انتخاب شود',
      });
    }

    input.lines.forEach((l, i) => {
      if (!l.quantity || l.quantity <= 0) {
        throw new BadRequestException({
          error:'INVALID_QUANTITY',
          lineIndex:i,
          message:'تعداد باید بزرگ‌تر از صفر باشد',
        });
      }
    });

    const created = await this.prisma.$transaction(
      input.lines.map(line =>
        this.prisma.pickTask.create({
          data:{
            warehouseId: input.warehouseId,
            productId: line.productId,
            locationId: line.locationId,
            quantity: line.quantity,
            note: line.note ?? null,
            invoiceId: input.invoiceId ?? null,
            assignedToId: input.assignedToId ?? null,
            requestedById: requestedById ?? null,
          },
        }),
      ),
    );

    const tasks = await this.findMany({ ids: created.map(c => c.id) });

    // همان لحظه به گوشیِ کارگر push کن — تخصیص‌داده‌شده فقط برای همان کارگر،
    // «هر کارگری» برای همه‌ی اتصال‌های زنده. اپ گوشی با این پیام فوراً زنگ می‌زند.
    this.gateway.emitNewPickTasks(tasks, input.assignedToId);

    return tasks;
  }


  /**
   * صف کارهای کارگر. اپ اندروید همین را با WorkManager می‌گیرد — روی LAN
   * چند ثانیه تأخیر دارد و برخلاف FCM به اینترنت و سرویس‌های گوگل نیاز ندارد.
   *
   * کارِ بدون تخصیص («هر کارگری») برای همه دیده می‌شود؛ کارِ تخصیص‌داده‌شده
   * فقط برای همان کارگر.
   */
  async findForWorker(userId: string, warehouseId?: string) {
    return this.findMany({
      status: PickTaskStatus.PENDING,
      warehouseId,
      forUserId: userId,
    });
  }


  async findMany(filter: {
    ids?:string[];
    status?:PickTaskStatus;
    warehouseId?:string;
    invoiceId?:string;
    forUserId?:string;
  }) {

    const where: Prisma.PickTaskWhereInput = {};

    if (filter.ids) where.id = { in: filter.ids };
    if (filter.status) where.status = filter.status;
    if (filter.warehouseId) where.warehouseId = filter.warehouseId;
    if (filter.invoiceId) where.invoiceId = filter.invoiceId;

    if (filter.forUserId) {
      where.OR = [
        { assignedToId: null },
        { assignedToId: filter.forUserId },
      ];
    }

    return this.prisma.pickTask.findMany({
      where,
      include:{
        // کارگر باید بدون تپ اضافه بداند چه کالایی و دقیقاً کجا.
        product:{ select:{ id:true, name:true, sku:true, unit:true, internalBarcode:true } },
        location:{ select:{ id:true, name:true, code:true, barcode:true, path:true } },
        requestedBy:{ select:{ id:true, fullName:true } },
        pickedBy:{ select:{ id:true, fullName:true } },
      },
      orderBy:{ createdAt:'asc' },
    });
  }


  async findOne(id: string) {
    const [task] = await this.findMany({ ids:[id] });
    if (!task) {
      throw new NotFoundException({
        error:'PICK_TASK_NOT_FOUND',
        message:'کار برداشت پیدا نشد',
      });
    }
    return task;
  }


  /**
   * کارگر «آوردم» می‌زند.
   *
   * ادعای اتمیک: اگر دو کارگر همزمان بزنند فقط یکی ثبت می‌شود و دومی پیام
   * روشن می‌گیرد — وگرنه دو نفر دنبال یک جنس می‌روند.
   */
  async markPicked(id: string, userId: string) {

    const claimed = await this.prisma.pickTask.updateMany({
      where:{ id, status: PickTaskStatus.PENDING },
      data:{
        status: PickTaskStatus.PICKED,
        pickedById: userId,
        pickedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.pickTask.findUnique({
        where:{ id },
        include:{ pickedBy:{ select:{ fullName:true } } },
      });

      if (!current) {
        throw new NotFoundException({
          error:'PICK_TASK_NOT_FOUND',
          message:'کار برداشت پیدا نشد',
        });
      }

      if (current.status === PickTaskStatus.PICKED) {
        throw new ConflictException({
          error:'ALREADY_PICKED',
          pickedBy: current.pickedBy?.fullName ?? null,
          message: current.pickedBy
            ? `این کالا را ${current.pickedBy.fullName} آورده است`
            : 'این کالا قبلاً آورده شده است',
        });
      }

      throw new ConflictException({
        error:'TASK_CANCELLED',
        message:'این کار لغو شده است',
      });
    }

    return this.findOne(id);
  }


  async cancel(id: string, reason?: string) {

    const claimed = await this.prisma.pickTask.updateMany({
      where:{ id, status: PickTaskStatus.PENDING },
      data:{
        status: PickTaskStatus.CANCELLED,
        cancelReason: reason ?? null,
      },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.pickTask.findUnique({ where:{ id } });

      if (!current) {
        throw new NotFoundException({
          error:'PICK_TASK_NOT_FOUND',
          message:'کار برداشت پیدا نشد',
        });
      }

      throw new ConflictException({
        error:'NOT_PENDING',
        status: current.status,
        message:'فقط کار در انتظار قابل لغو است',
      });
    }

    return this.findOne(id);
  }
}
