import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { buildSearchTokens } from '../products/search-tokens';
import {
  ApproveProductRequestDto,
  CreateProductRequestDto,
} from './dto/product-request.dto';

@Injectable()
export class ProductRequestsService {
  constructor(
    private prisma: PrismaService,
    private inventoryOperation: InventoryOperationService,
  ) {}

  private readonly reviewInclude = {
    category: { select: { id: true, name: true } },
    location: { include: { warehouse: true } },
    worker: { select: { id: true, username: true, fullName: true } },
    reviewedBy: { select: { id: true, username: true, fullName: true } },
    createdProduct: { select: { id: true, name: true, sku: true } },
  };

  /** Worker submits a new-product request; it lands PENDING for manager review. */
  async create(dto: CreateProductRequestDto, workerId?: string) {
    const location = dto.locationBarcode
      ? await this.prisma.location.findUnique({
          where: { barcode: dto.locationBarcode },
          select: { id: true, warehouseId: true },
        })
      : null;

    return this.prisma.productCreationRequest.create({
      data: {
        name: dto.name.trim(),
        brandName: dto.brandName?.trim() || null,
        categoryId: dto.categoryId || null,
        vehicles: dto.vehicles?.map((v) => v.trim()).filter(Boolean) ?? [],
        quantity: dto.quantity ?? 1,
        unit: dto.unit?.trim() || 'عدد',
        notes: dto.notes?.trim() || null,
        voiceText: dto.voiceText ?? null,
        locationBarcode: dto.locationBarcode ?? null,
        warehouseId: location?.warehouseId ?? null,
        locationId: location?.id ?? null,
        sessionId: dto.sessionId ?? null,
        workerId: workerId ?? null,
      },
      include: this.reviewInclude,
    });
  }

  /** Manager review list, optionally filtered by status and warehouse. */
  async list(status?: string, warehouseId?: string) {
    const normalized = status?.toUpperCase();
    return this.prisma.productCreationRequest.findMany({
      where: {
        ...(normalized && normalized !== 'ALL' ? { status: normalized } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: this.reviewInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A worker's own requests (so they can see approval/rejection). */
  async listMine(workerId?: string) {
    if (!workerId) return [];
    return this.prisma.productCreationRequest.findMany({
      where: { workerId },
      include: this.reviewInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve = create the real Product (master data) and apply the requested stock
   * through InventoryOperationService (the single audited ledger path). The manager
   * may correct fields first. Atomic status claim makes a double-approve safe.
   */
  async approve(
    id: string,
    reviewerId?: string,
    edits?: ApproveProductRequestDto,
  ) {
    const req = await this.prisma.productCreationRequest.findUnique({
      where: { id },
    });
    if (!req) throw new NotFoundException('درخواست پیدا نشد');
    if (req.status === 'APPROVED') {
      return this.prisma.productCreationRequest.findUnique({
        where: { id },
        include: this.reviewInclude,
      });
    }
    if (req.status === 'REJECTED') {
      throw new BadRequestException('این درخواست قبلاً رد شده است');
    }

    // Effective (possibly manager-corrected) values.
    const name = (edits?.name ?? req.name).trim();
    const brandName = (edits?.brandName ?? req.brandName ?? '').trim();
    const categoryId = edits?.categoryId ?? req.categoryId ?? null;
    const unit = (edits?.unit ?? req.unit).trim() || 'عدد';
    const quantity = edits?.quantity ?? req.quantity;
    const vehicles = edits?.vehicles ?? req.vehicles;

    // Claim PENDING -> APPROVED atomically; only the winner proceeds.
    const claim = await this.prisma.productCreationRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId ?? null,
        reviewedAt: new Date(),
        name,
        brandName: brandName || null,
        categoryId,
        unit,
        quantity,
        vehicles,
      },
    });
    if (claim.count === 0) {
      return this.prisma.productCreationRequest.findUnique({
        where: { id },
        include: this.reviewInclude,
      });
    }

    try {
      // Resolve brand (find or create — approved master data) and best-effort vehicle.
      let brandId: string | null = null;
      if (brandName) {
        const brand = await this.prisma.brand.upsert({
          where: { name: brandName },
          update: {},
          create: { name: brandName },
        });
        brandId = brand.id;
      }
      const firstVehicle = vehicles[0];
      const vehicle = firstVehicle
        ? await this.prisma.vehicleModel.findFirst({
            where: {
              OR: [{ name: firstVehicle }, { aliases: { has: firstVehicle } }],
            },
            select: { id: true },
          })
        : null;

      const sku = `REQ-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`.toUpperCase();

      const product = await this.prisma.product.create({
        data: {
          name,
          sku,
          searchTokens: buildSearchTokens(name, sku, null),
          unit,
          brandId,
          categoryId,
          vehicleModelId: vehicle?.id ?? null,
          isActive: true,
          description: req.notes ?? null,
        },
      });

      // Apply requested stock through the audited ledger, if we have a location.
      if (quantity > 0 && req.locationId) {
        await this.inventoryOperation.execute({
          type: 'IN',
          productId: product.id,
          locationId: req.locationId,
          quantity,
          source: 'PRODUCT_REQUEST',
          userId: reviewerId,
          note: `ایجاد کالا از درخواست کارگر: ${name}`,
        });
      }

      return this.prisma.productCreationRequest.update({
        where: { id },
        data: { createdProductId: product.id },
        include: this.reviewInclude,
      });
    } catch (error) {
      // Roll the claim back so it can be retried, rather than leaving it APPROVED
      // without a product.
      await this.prisma.productCreationRequest.update({
        where: { id },
        data: { status: 'PENDING', reviewedById: null, reviewedAt: null },
      });
      throw error;
    }
  }

  async reject(id: string, reviewerId?: string, reviewNote?: string) {
    const req = await this.prisma.productCreationRequest.findUnique({
      where: { id },
    });
    if (!req) throw new NotFoundException('درخواست پیدا نشد');
    if (req.status !== 'PENDING') {
      return this.prisma.productCreationRequest.findUnique({
        where: { id },
        include: this.reviewInclude,
      });
    }

    return this.prisma.productCreationRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerId ?? null,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
      include: this.reviewInclude,
    });
  }
}
