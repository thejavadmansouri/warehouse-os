import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildThermalLabelHtml } from '../labels/label-template';
import { LabelsService } from '../labels/labels.service';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export type EnqueueProductLabelInput = {
  productId: string;
  copies: number;
  createdById: string;
  locationId?: string | null;
  pendingOperationId?: string | null;
  source?: string;
};

@Injectable()
export class PrintJobsService {
  constructor(
    private prisma: PrismaService,
    private labelsService: LabelsService,
  ) {}

  /**
   * بعد از تأیید ورود کالا: یک job PENDING با تعداد لیبل = qty می‌سازد.
   * چاپ واقعی فقط با confirm روی PC انجام می‌شود.
   */
  async enqueueProductLabel(input: EnqueueProductLabelInput) {
    const copies = Math.max(1, Math.floor(Number(input.copies) || 1));
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({
        error: 'PRODUCT_NOT_FOUND',
        message: 'کالا برای صف چاپ پیدا نشد',
      });
    }

    // اگر همین عملیات قبلاً job ساخته، دوباره نساز (تأیید دوبل / retry).
    if (input.pendingOperationId) {
      const existing = await this.prisma.printJobItem.findFirst({
        where: {
          pendingOperationId: input.pendingOperationId,
          productId: input.productId,
          job: { type: 'PRODUCT_LABEL', status: { in: ['PENDING', 'PROCESSING'] } },
        },
        select: { jobId: true },
      });
      if (existing) {
        return this.getJob(existing.jobId);
      }
    }

    return this.prisma.printJob.create({
      data: {
        type: 'PRODUCT_LABEL',
        status: 'PENDING',
        source: input.source ?? 'REVIEW_APPROVE',
        totalItems: 1,
        printedItems: 0,
        createdById: input.createdById,
        items: {
          create: [
            {
              productId: input.productId,
              locationId: input.locationId ?? null,
              pendingOperationId: input.pendingOperationId ?? null,
              copies,
              status: 'PENDING',
            },
          ],
        },
      },
      include: this.jobInclude(),
    });
  }

  async listJobs(q: { status?: string; type?: string } = {}) {
    return this.prisma.printJob.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.type ? { type: q.type } : {}),
      },
      include: this.jobInclude(),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: this.jobInclude(),
    });
    if (!job) {
      throw new NotFoundException({
        error: 'PRINT_JOB_NOT_FOUND',
        message: 'کار چاپ پیدا نشد',
      });
    }
    return job;
  }

  /**
   * تأیید روی PC: لیبل کالا را از طریق پرینتر تنظیم‌شده (شبکه/نام ویندوز) چاپ می‌کند.
   */
  async confirmProductJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (job.type !== 'PRODUCT_LABEL') {
      throw new BadRequestException({
        error: 'WRONG_JOB_TYPE',
        message: 'این صف برای لیبل کالا نیست',
      });
    }
    if (job.status === 'COMPLETED') return job;
    if (job.status !== 'PENDING' && job.status !== 'FAILED') {
      throw new BadRequestException({
        error: 'JOB_NOT_CONFIRMABLE',
        message: 'این کار چاپ در وضعیت قابل تأیید نیست',
      });
    }

    await this.prisma.printJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    let printed = 0;
    try {
      for (const item of job.items) {
        if (!item.productId) {
          await this.prisma.printJobItem.update({
            where: { id: item.id },
            data: { status: 'FAILED' },
          });
          continue;
        }
        await this.labelsService.printProductLabelsDirect(
          [item.productId],
          item.copies,
        );
        await this.prisma.printJobItem.update({
          where: { id: item.id },
          data: { status: 'PRINTED' },
        });
        printed++;
        await this.prisma.printJob.update({
          where: { id: jobId },
          data: { printedItems: printed },
        });
      }

      return this.prisma.printJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', printedItems: printed },
        include: this.jobInclude(),
      });
    } catch (error) {
      await this.prisma.printJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  async cancelJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (job.status !== 'PENDING') {
      throw new BadRequestException({
        error: 'JOB_NOT_CANCELABLE',
        message: 'فقط کارهای در انتظار را می‌شود لغو کرد',
      });
    }
    return this.prisma.printJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
      include: this.jobInclude(),
    });
  }

  /** مسیر قدیمی لیبل قفسه — HTML روی دیسک. */
  async runJob(jobId: string) {
    const job = await this.getJob(jobId);

    const jobFolder = join(process.cwd(), 'storage', 'labels', 'jobs', job.id);

    if (!existsSync(jobFolder)) {
      mkdirSync(jobFolder, {
        recursive: true,
      });
    }

    await this.prisma.printJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: 'PROCESSING',
      },
    });

    let printed = 0;

    for (const item of job.items) {
      if (!item.location) {
        continue;
      }

      try {
        const label = await this.labelsService.locationLabel(item.location.id);
        const png = Buffer.from(buildThermalLabelHtml(label, 384), 'utf8');

        const filename = `${String(printed + 1).padStart(4, '0')}-${item.location.code}.html`;

        const filepath = join(jobFolder, filename);

        writeFileSync(filepath, png);

        await this.prisma.printJobItem.update({
          where: {
            id: item.id,
          },
          data: {
            status: 'PRINTED',
          },
        });

        printed++;

        await this.prisma.printJob.update({
          where: {
            id: jobId,
          },
          data: {
            printedItems: printed,
          },
        });
      } catch {
        await this.prisma.printJobItem.update({
          where: {
            id: item.id,
          },
          data: {
            status: 'FAILED',
          },
        });
      }
    }

    await this.prisma.printJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: 'COMPLETED',
      },
    });

    return {
      jobId,
      printed,
      folder: jobFolder,
      status: 'COMPLETED',
    };
  }

  private jobInclude() {
    return {
      createdBy: { select: { id: true, fullName: true, username: true } },
      items: {
        include: {
          location: {
            select: {
              id: true,
              code: true,
              name: true,
              path: true,
              warehouseId: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              internalBarcode: true,
              labelPrintedAt: true,
            },
          },
        },
      },
    } as const;
  }
}
