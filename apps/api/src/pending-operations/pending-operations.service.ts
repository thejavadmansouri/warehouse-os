import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineService } from '../engine/parsing-engine.service';
import { ProductMatcherService } from '../inventory/product-matcher.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SyncOperationItemDto } from './dto/sync-operations.dto';

@Injectable()
export class PendingOperationsService {
  constructor(
    private prisma: PrismaService,
    private parsingEngine: ParsingEngineService,
    private productMatcher: ProductMatcherService,
    private inventoryOperation: InventoryOperationService,
  ) {}

  /**
   * Batch upload from the worker app. Each op is deduped by clientRequestId
   * (idempotent), the raw transcript is parsed + matched server-side, and it lands
   * as PENDING — never touching stock. A manager approves later.
   */
  async sync(operations: SyncOperationItemDto[], workerId?: string) {
    const results: { clientRequestId: string; id: string; status: string }[] = [];

    for (const op of operations) {
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
          deviceCreatedAt: op.deviceCreatedAt ? new Date(op.deviceCreatedAt) : null,
        },
      });

      results.push({
        clientRequestId: op.clientRequestId,
        id: created.id,
        status: created.status,
      });
    }

    return { synced: results.length, results };
  }

  /** Manager review queue for a warehouse (or all). */
  /**
   * کارهای یک کارگر با تصمیم مدیر روی هرکدام.
   *
   * کارگر باید ببیند چه ثبت کرده، چند تا تأیید شده، و کدام رد شده و چرا —
   * وگرنه همان اشتباه را تکرار می‌کند. پیش‌فرض: از ابتدای امروز.
   */
  async myWork(userId: string, since?: string) {
    const from = since
      ? new Date(since)
      : new Date(new Date().setHours(0, 0, 0, 0));

    const ops = await this.prisma.pendingOperation.findMany({
      where: { workerId: userId, createdAt: { gte: isNaN(from.getTime()) ? undefined : from } },
      include: {
        product: { select: { name: true, sku: true } },
        reviewedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const o of ops) {
      if (o.status === 'APPROVED') counts.approved++;
      else if (o.status === 'REJECTED') counts.rejected++;
      else counts.pending++;
    }

    return {
      summary: { total: ops.length, ...counts },
      items: ops.map((o) => ({
        id: o.id,
        status: o.status,
        productName: o.product?.name ?? null,
        voiceText: o.voiceText,
        quantity: o.quantity,
        reviewNote: o.reviewNote,
        reviewedByName: o.reviewedBy?.fullName ?? null,
        createdAt: o.createdAt,
        reviewedAt: o.reviewedAt,
      })),
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
