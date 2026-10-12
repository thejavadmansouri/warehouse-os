import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineService } from '../engine/parsing-engine.service';
import { ProductMatcherService } from '../inventory/product-matcher.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { PrintJobsService } from '../print-jobs/print-jobs.service';
import { ProductImagesService } from '../product-images/product-images.service';
import { SyncOperationItemDto } from './dto/sync-operations.dto';

@Injectable()
export class PendingOperationsService {
  private readonly logger = new Logger(PendingOperationsService.name);

  constructor(
    private prisma: PrismaService,
    private parsingEngine: ParsingEngineService,
    private productMatcher: ProductMatcherService,
    private inventoryOperation: InventoryOperationService,
    private printJobs: PrintJobsService,
    private productImages: ProductImagesService,
  ) {}

  /**
   * Batch upload from the worker app. Each op is deduped by clientRequestId
   * (idempotent), the raw transcript is parsed + matched server-side, and it lands
   * as PENDING — never touching stock for STAFF. MANAGER/ADMIN commits immediately
   * (approve → stock + label print queue) when product + location are known.
   */
  async sync(
    operations: SyncOperationItemDto[],
    workerId?: string,
    workerRole?: string,
  ) {
    const results: { clientRequestId: string; id: string; status: string }[] =
      [];
    const directCommit =
      workerRole === 'ADMIN' || workerRole === 'MANAGER';

    for (const op of operations) {
      try {
        const existing = await this.prisma.pendingOperation.findUnique({
          where: { clientRequestId: op.clientRequestId },
        });
        if (existing) {
          results.push({
            clientRequestId: op.clientRequestId,
            id: existing.id,
            status: existing.status,
          });
          continue;
        }

        const location = await this.prisma.location.findUnique({
          where: { barcode: op.locationBarcode },
        });

        let parsedPayload: any = null;
        let productId: string | null = op.productId ?? null;
        let quantity = op.quantity ?? 1;
        let unit: string | null = op.unit ?? null;

        if (op.voiceText) {
          const engineResult = this.parsingEngine.parse(op.voiceText);
          const parsed = engineResult.data;
          const unknownTokens = engineResult.explanation.unknownTokens ?? [];

          const [partCatalogId, vehicleModelIds, brandId] = await Promise.all([
            this.productMatcher.findPartCatalogIdByName(parsed.productName),
            this.productMatcher.findVehicleModelIdsByName(
              parsed.vehicleModel ?? parsed.vehicleFamily,
            ),
            this.productMatcher.findBrandIdByName(parsed.brand),
          ]);

          const match = await this.productMatcher.match({
            partCatalogId,
            partName: parsed.productName,
            vehicleModelIds,
            vehicleName: parsed.vehicleModel ?? parsed.vehicleFamily,
            brandId,
            brandName: parsed.brand,
            keywordTokens: unknownTokens,
            modelIsExplicit: !!parsed.vehicleModel,
          });

          const suggestions = (match.suggestions ?? []).map((s: any) => ({
            id: s.product.id,
            name: s.product.name,
            confidence: s.confidence,
          }));

          // Store a best-guess for the manager to confirm; never final until approved.
          if (!productId && match.best) productId = match.best.product.id;

          parsedPayload = { parsed, suggestions };
          if (!op.quantity && parsed.quantity) quantity = parsed.quantity;
          if (!unit && (parsed as any).unit) unit = (parsed as any).unit;
        }

        const created = await this.prisma.pendingOperation.create({
          data: {
            clientRequestId: op.clientRequestId,
            type: op.type ?? 'IN',
            locationBarcode: op.locationBarcode,
            voiceText: op.voiceText ?? null,
            parsed: parsedPayload ?? undefined,
            quantity,
            unit,
            warehouseId: location?.warehouseId ?? null,
            locationId: location?.id ?? null,
            productId,
            workerId: workerId ?? null,
            deviceCreatedAt: op.deviceCreatedAt
              ? new Date(op.deviceCreatedAt)
              : null,
          },
        });

        let status = created.status;

        // مدیر/مدیرکل با اپ: بدون صف وب، مستقیم موجودی + صف چاپ لیبل.
        // COUNT فقط وضعیت را تأیید می‌کند (approve برای COUNT موجودی نمی‌زند).
        // بدون productId برای IN نمی‌شود commit کرد — PENDING می‌ماند.
        const canDirect =
          directCommit &&
          workerId &&
          (created.type === 'COUNT' ||
            (created.type === 'IN' &&
              !!created.productId &&
              !!created.locationId));
        if (canDirect) {
          try {
            const approved = await this.approve(created.id, workerId, undefined, {
              printSource: 'APP_DIRECT',
            });
            status = approved?.status ?? 'APPROVED';
          } catch (err) {
            this.logger.warn(
              `sync direct-approve failed for ${created.id}: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }

        results.push({
          clientRequestId: op.clientRequestId,
          id: created.id,
          status,
        });
      } catch (err) {
        /*
         * یک قلمِ خراب نباید کلِ دسته را بیندازد.
         *
         * این حلقه تراکنشی نیست: تا اینجا هرچه ساخته شده، ساخته شده. اگر
         * استثنا بالا برود، پاسخ ۵۰۰ می‌شود و گوشیِ کارگر **همه‌ی** ردیف‌های
         * دسته را «ردشده» علامت می‌زند — حتی آن‌هایی که واقعاً ثبت شده‌اند.
         * کارگر ده ردیف قرمز می‌بیند که نصفشان روی سرور هستند.
         *
         * حالا خطا به همان قلم می‌چسبد و بقیه‌ی دسته می‌روند جلو. تکرارِ
         * ارسال هم بی‌خطر است: clientRequestId یکتاست و بالای همین حلقه
         * dedupe می‌شود.
         */
        this.logger.error(
          `sync: قلم ${op.clientRequestId} ثبت نشد — ${err instanceof Error ? err.message : err}`,
        );
        results.push({
          clientRequestId: op.clientRequestId,
          id: '',
          status: 'ERROR',
        });
      }
    }

    return {
      synced: results.filter((r) => r.status !== 'ERROR').length,
      results,
    };
  }

  /** Manager review queue for a warehouse (or all). */
  /**
   * کارهای یک کاربر با روند کامل: وضعیت تأیید، قفسه، عکس، وضعیت چاپ لیبل.
   *
   * کارگر و مدیر هر دو همین صفحه را می‌بینند تا بفهمند چه اسکن/ثبت شده و
   * لیبل کجای صف چاپ است. پیش‌فرض: از ابتدای امروز.
   */
  async myWork(userId: string, since?: string, role?: string) {
    const from = since
      ? new Date(since)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const sinceOk = !isNaN(from.getTime());
    const isManager = role === 'ADMIN' || role === 'MANAGER';

    // کارگر: فقط ثبت‌های خودش.
    // مدیر: ثبت‌های خودش روی اپ + کارهایی که امروز بررسی کرده.
    const where = sinceOk
      ? isManager
        ? {
            OR: [
              { workerId: userId, createdAt: { gte: from } },
              { reviewedById: userId, reviewedAt: { gte: from } },
            ],
          }
        : { workerId: userId, createdAt: { gte: from } }
      : isManager
        ? {
            OR: [{ workerId: userId }, { reviewedById: userId }],
          }
        : { workerId: userId };

    const ops = await this.prisma.pendingOperation.findMany({
      where,
      include: {
        product: { select: { name: true, sku: true } },
        location: {
          select: { id: true, code: true, name: true, path: true },
        },
        worker: { select: { id: true, fullName: true, username: true } },
        reviewedBy: { select: { fullName: true } },
        assets: { select: { id: true }, take: 5 },
        printJobItems: {
          select: {
            copies: true,
            status: true,
            job: { select: { id: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      printQueued: 0,
      printDone: 0,
      withPhoto: 0,
    };

    const items = ops.map((o) => {
      if (o.status === 'APPROVED') counts.approved++;
      else if (o.status === 'REJECTED') counts.rejected++;
      else counts.pending++;

      const photoIds = o.assets.map((a) => a.id);
      if (photoIds.length) counts.withPhoto++;

      const printItem = o.printJobItems[0] ?? null;
      const jobStatus = printItem?.job?.status ?? null;
      let printStatus: 'NONE' | 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED' =
        'NONE';
      if (jobStatus === 'PENDING') printStatus = 'QUEUED';
      else if (jobStatus === 'PROCESSING') printStatus = 'PRINTING';
      else if (jobStatus === 'COMPLETED' || printItem?.status === 'PRINTED')
        printStatus = 'PRINTED';
      else if (jobStatus === 'FAILED' || printItem?.status === 'FAILED')
        printStatus = 'FAILED';
      else if (jobStatus === 'CANCELLED') printStatus = 'CANCELLED';

      if (printStatus === 'QUEUED' || printStatus === 'PRINTING')
        counts.printQueued++;
      if (printStatus === 'PRINTED') counts.printDone++;

      return {
        id: o.id,
        type: o.type,
        status: o.status,
        productName: o.product?.name ?? null,
        productSku: o.product?.sku ?? null,
        voiceText: o.voiceText,
        quantity: o.quantity,
        unit: o.unit,
        locationCode: o.location?.code ?? null,
        locationPath: o.location?.path ?? o.location?.name ?? null,
        workerName: o.worker?.fullName || o.worker?.username || null,
        mine: o.workerId === userId,
        reviewNote: o.reviewNote,
        reviewedByName: o.reviewedBy?.fullName ?? null,
        createdAt: o.createdAt,
        reviewedAt: o.reviewedAt,
        photoCount: photoIds.length,
        photoIds,
        printStatus,
        printCopies: printItem?.copies ?? null,
      };
    });

    return {
      summary: { total: ops.length, ...counts },
      items,
    };
  }

  async listPending(warehouseId?: string) {
    return this.prisma.pendingOperation.findMany({
      where: {
        status: 'PENDING',
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: {
        location: { include: { warehouse: true } },
        product: { include: { brand: true, barcodes: true } },
        worker: { select: { id: true, username: true, fullName: true } },
        // Photo bytes are served only via the authenticated /uploads/photo/:id
        // endpoint — expose ids, never the raw storage path.
        assets: {
          select: { id: true, mimeType: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Manager approval = the commit. Writes stock through the single ledger path
   * (InventoryOperationService.execute) with source WORKER_VOICE. The manager may
   * override the product/quantity before approving.
   */
  async approve(
    id: string,
    reviewerId?: string,
    override?: { productId?: string; quantity?: number },
    options?: { printSource?: string },
  ) {
    const op = await this.prisma.pendingOperation.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('عملیات پیدا نشد');
    if (op.status === 'APPROVED') return op; // idempotent
    if (op.status === 'REJECTED') {
      throw new BadRequestException('این عملیات قبلاً رد شده است');
    }

    // A COUNT is a cycle-count record captured offline, NOT a stock movement.
    // Approving it only confirms the recorded number — it must never touch the
    // ledger. The claim is still atomic (idempotent under a double-click), and an
    // unmatched product is allowed (the manager may have counted something the
    // catalog doesn't have yet); the raw voiceText stays for correction.
    if (op.type === 'COUNT') {
      const countProductId = override?.productId ?? op.productId;
      const countQuantity = override?.quantity ?? op.quantity;
      await this.prisma.pendingOperation.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          productId: countProductId ?? undefined,
          quantity: countQuantity,
          reviewedById: reviewerId ?? null,
          reviewedAt: new Date(),
        },
      });
      return this.prisma.pendingOperation.findUnique({ where: { id } });
    }

    const productId = override?.productId ?? op.productId;
    if (!productId) {
      throw new BadRequestException('قبل از تأیید، محصول را مشخص کنید');
    }
    if (!op.locationId) {
      throw new BadRequestException('موقعیت این عملیات نامعتبر است');
    }
    const quantity = override?.quantity ?? op.quantity;

    // Idempotency under concurrency: atomically flip PENDING -> APPROVED. Only the
    // request that wins the flip (count === 1) commits stock — a double-click or
    // replayed request finds count === 0 and returns without adding stock again.
    const claim = await this.prisma.pendingOperation.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        productId,
        quantity,
        reviewedById: reviewerId ?? null,
        reviewedAt: new Date(),
      },
    });

    if (claim.count === 0) {
      // Someone already approved it — do NOT execute the operation again.
      return this.prisma.pendingOperation.findUnique({ where: { id } });
    }

    let committedLogId: string | null = null;
    try {
      const result = await this.inventoryOperation.execute({
        type: 'IN',
        productId,
        locationId: op.locationId,
        quantity,
        source: 'WORKER_VOICE',
        userId: reviewerId,
        note: op.voiceText || 'تأیید مدیر برای عملیات صوتی کارگر',
      });
      committedLogId =
        (result as { inventoryLogId?: string } | null)?.inventoryLogId ?? null;
    } catch (error) {
      // Commit failed — release the claim so it can be retried, don't leave it
      // stuck as APPROVED-without-stock.
      await this.prisma.pendingOperation.update({
        where: { id },
        data: { status: 'PENDING', reviewedById: null, reviewedAt: null },
      });
      throw error;
    }

    // Back-link the ledger row, and move any worker photos captured against the
    // pending op onto the committed InventoryLog so the chain
    // InventoryLog -> Asset -> storage object holds after approval.
    if (committedLogId) {
      await this.prisma.$transaction([
        this.prisma.pendingOperation.update({
          where: { id },
          data: { committedLogId },
        }),
        this.prisma.asset.updateMany({
          where: { pendingOperationId: id },
          data: { inventoryLogId: committedLogId },
        }),
      ]);
    }

    // صف چاپ لیبل کالا — هنوز چاپ نمی‌شود؛ مدیر روی PC تأیید می‌کند.
    if (reviewerId) {
      try {
        await this.printJobs.enqueueProductLabel({
          productId,
          copies: quantity,
          createdById: reviewerId,
          locationId: op.locationId,
          pendingOperationId: id,
          source: options?.printSource ?? 'REVIEW_APPROVE',
        });
      } catch (err) {
        // موجودی قبلاً ثبت شده؛ صف چاپ نباید تأیید را بشکند.
        this.logger.warn(
          `enqueue label print failed for pending ${id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    // عکس دوربین اپ → عکس سایت (واترمارک/SEO)؛ اگر autoPublish و لیبل آماده باشد صفحه روشن می‌شود.
    try {
      await this.productImages.promoteInventoryPhotos(productId);
    } catch (err) {
      this.logger.warn(
        `promote site photos failed for pending ${id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return this.prisma.pendingOperation.findUnique({ where: { id } });
  }

  /**
   * تأییدِ گروهی. هر id از همان مسیرِ تکیِ `approve` رد می‌شود تا کلِ منطقِ
   * claim/rollback/idempotency دست‌نخورده بماند. آیتمی که آماده نیست (محصول
   * ندارد یا موقعیتش نامعتبر است) کلِ عملیات را نمی‌شکند — رد می‌شود و در
   * `failed` گزارش می‌شود تا مدیر آن یکی را دستی رسیدگی کند.
   *
   * ترتیبی (نه موازی) اجرا می‌شود: هر approve یک تراکنشِ موجودی است و باز کردنِ
   * هم‌زمانِ صدها اتصال، pool را ته می‌کشد و کلِ API را می‌خواباند.
   */
  async approveMany(ids: string[], reviewerId?: string) {
    const failed: { id: string; message: string }[] = [];
    let approved = 0;
    for (const id of ids) {
      try {
        await this.approve(id, reviewerId);
        approved++;
      } catch (err) {
        failed.push({
          id,
          message: err instanceof Error ? err.message : 'خطا در تأیید',
        });
      }
    }
    return { approved, failedCount: failed.length, failed };
  }

  async reject(id: string, reviewerId?: string, reviewNote?: string) {
    const op = await this.prisma.pendingOperation.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('عملیات پیدا نشد');
    if (op.status !== 'PENDING') return op;

    return this.prisma.pendingOperation.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerId ?? null,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });
  }
}
