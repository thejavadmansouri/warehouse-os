import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePipeline } from '../common/image-pipeline';

@Injectable()
export class UploadsService {
  private productPath = join(process.cwd(), 'storage', 'products');
  private inventoryLogPath = join(process.cwd(), 'storage', 'inventory-logs');
  private inventoryPhotoPath = join(
    process.cwd(),
    'storage',
    'inventory-photos',
  );

  constructor(
    private prisma: PrismaService,
    private images: ImagePipeline,
  ) {
    for (const p of [
      this.productPath,
      this.inventoryLogPath,
      this.inventoryPhotoPath,
    ]) {
      if (!existsSync(p)) mkdirSync(p, { recursive: true });
    }
  }

  /**
   * عکس محصول — همان pipeline تاییدشده‌ی pending-operation:
   * سقف حجم، MIME مجاز، sniff و re-encode با sharp (حذف EXIF/GPS) + تامب‌نیل.
   */
  async uploadProductImage(productId: string, file: Express.Multer.File) {
    const p = await this.images.process(file);
    const base = `${productId}-${Date.now()}-${p.sha256.slice(0, 8)}`;
    writeFileSync(join(this.productPath, `${base}.jpg`), p.mainBuffer);
    writeFileSync(join(this.productPath, `${base}.thumb.jpg`), p.thumbBuffer);
    return this.prisma.asset.create({
      data: {
        path: `/storage/products/${base}.jpg`,
        thumbnailPath: `/storage/products/${base}.thumb.jpg`,
        fileName: `${base}.jpg`,
        type: 'PRODUCT_IMAGE',
        mimeType: 'image/jpeg',
        bytes: p.mainBuffer.length,
        width: p.width,
        height: p.height,
        sha256: p.sha256,
        productId,
      },
    });
  }

  /**
   * عکسِ گرفته‌شده در کاردکس (INVENTORY_IMAGE) را «تصویر محصول» می‌کند.
   *
   * کپی می‌کنیم، نه ارجاع: تصویر محصول باید زیر /storage/products سرو شود
   * (پوشه‌ی عمومیِ بدون توکن)، ولی عکس‌های انبار پشت JWT و زیر
   * storage/inventory-photos هستند. عکسِ کاردکسِ اصلی دست نمی‌خورد — سندِ
   * حرکت عکسِ خودش را نگه می‌دارد؛ محصول یک کپیِ مستقل می‌گیرد.
   *
   * اگر محصول قبلاً عکس داشت، عکسِ قبلی «عزل» می‌شود (productId خالی) تا
   * تازه‌ترین انتخابی که مدیر کرده نمایش داده شود؛ فایلش روی دیسک می‌ماند.
   */
  async setProductImageFromAsset(productId: string, assetId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('کالا پیدا نشد');

    const src = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!src || !src.path) throw new NotFoundException('عکس پیدا نشد');

    const srcMain = join(process.cwd(), src.path.replace(/^\//, ''));
    if (!existsSync(srcMain)) throw new NotFoundException('فایل عکس موجود نیست');
    const mainBuffer = readFileSync(srcMain);
    const thumbBuffer = src.thumbnailPath
      ? readFileSync(join(process.cwd(), src.thumbnailPath.replace(/^\//, '')))
      : mainBuffer;

    const sha = createHash('sha256').update(mainBuffer).digest('hex');
    const base = `${productId}-${Date.now()}-${sha.slice(0, 8)}`;
    writeFileSync(join(this.productPath, `${base}.jpg`), mainBuffer);
    writeFileSync(join(this.productPath, `${base}.thumb.jpg`), thumbBuffer);

    // عزل عکس قبلی محصول — عکس تازه‌ای که مدیر انتخاب کرده نمایش داده شود.
    await this.prisma.asset.updateMany({
      where: { productId, type: 'PRODUCT_IMAGE' },
      data: { productId: null },
    });

    return this.prisma.asset.create({
      data: {
        path: `/storage/products/${base}.jpg`,
        thumbnailPath: `/storage/products/${base}.thumb.jpg`,
        fileName: `${base}.jpg`,
        type: 'PRODUCT_IMAGE',
        mimeType: src.mimeType ?? 'image/jpeg',
        bytes: mainBuffer.length,
        width: src.width,
        height: src.height,
        sha256: sha,
        productId,
      },
    });
  }

  /** عکس لاگ انبار — همان pipeline تاییدشده. */
  async uploadInventoryLogImage(logId: string, file: Express.Multer.File) {
    const p = await this.images.process(file);
    const base = `${logId}-${Date.now()}-${p.sha256.slice(0, 8)}`;
    writeFileSync(join(this.inventoryLogPath, `${base}.jpg`), p.mainBuffer);
    writeFileSync(
      join(this.inventoryLogPath, `${base}.thumb.jpg`),
      p.thumbBuffer,
    );
    return this.prisma.asset.create({
      data: {
        path: `/storage/inventory-logs/${base}.jpg`,
        thumbnailPath: `/storage/inventory-logs/${base}.thumb.jpg`,
        fileName: `${base}.jpg`,
        type: 'INVENTORY_IMAGE',
        mimeType: 'image/jpeg',
        bytes: p.mainBuffer.length,
        width: p.width,
        height: p.height,
        sha256: p.sha256,
        inventoryLogId: logId,
      },
    });
  }

  /**
   * Worker photo for an offline-captured operation. Keyed by clientRequestId (the
   * same idempotency key as the operation), so a retried upload never duplicates.
   * The op must already be synced (PendingOperation exists). If the op was approved
   * before its photo arrived, the asset is attached to the committed InventoryLog.
   */
  async uploadPendingOperationPhoto(
    clientRequestId: string,
    file: Express.Multer.File,
  ) {
    const p = await this.images.process(file);

    const op = await this.prisma.pendingOperation.findUnique({
      where: { clientRequestId },
      select: { id: true, committedLogId: true },
    });
    if (!op) {
      // Op not synced yet — the client retries after the operation lands.
      throw new NotFoundException('عملیات مرتبط پیدا نشد');
    }

    // Idempotent re-upload: same op + same bytes → return the existing asset.
    const existing = await this.prisma.asset.findFirst({
      where: { pendingOperationId: op.id, sha256: p.sha256 },
      select: { id: true },
    });
    if (existing) return existing;

    const base = `${clientRequestId}-${p.sha256.slice(0, 12)}`;
    writeFileSync(join(this.inventoryPhotoPath, `${base}.jpg`), p.mainBuffer);
    writeFileSync(
      join(this.inventoryPhotoPath, `${base}.thumb.jpg`),
      p.thumbBuffer,
    );

    return this.prisma.asset.create({
      data: {
        path: `/storage/inventory-photos/${base}.jpg`,
        thumbnailPath: `/storage/inventory-photos/${base}.thumb.jpg`,
        fileName: `${base}.jpg`,
        type: 'INVENTORY_IMAGE',
        mimeType: 'image/jpeg',
        bytes: p.mainBuffer.length,
        width: p.width,
        height: p.height,
        sha256: p.sha256,
        pendingOperationId: op.id,
        // If the op is already committed, link straight to the ledger row too.
        inventoryLogId: op.committedLogId ?? undefined,
      },
      select: { id: true },
    });
  }

  /** Resolve an asset's on-disk file for authenticated streaming (role-gated). */
  async getAssetFile(assetId: string, variant: 'full' | 'thumb') {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { path: true, thumbnailPath: true, mimeType: true },
    });
    if (!asset) throw new NotFoundException('عکس پیدا نشد');

    const rel =
      variant === 'thumb' ? (asset.thumbnailPath ?? asset.path) : asset.path;
    // Stored paths are "/storage/...". Map back to the on-disk absolute path.
    const absolute = join(process.cwd(), rel.replace(/^\//, ''));
    if (!existsSync(absolute))
      throw new NotFoundException('فایل عکس موجود نیست');

    return { absolute, mimeType: asset.mimeType ?? 'image/jpeg' };
  }
}
