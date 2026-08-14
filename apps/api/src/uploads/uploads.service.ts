import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Express } from 'express';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

/** Accepted inbound image types (worker photos are compressed JPEG on-device). */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/webp']);
/** Hard cap after client-side compression (~250 KB expected). Rejects full-res. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Longest edge for the stored image and the list thumbnail. */
const MAX_EDGE = 1600;
const THUMB_EDGE = 320;

@Injectable()
export class UploadsService {
  private productPath = join(process.cwd(), 'storage', 'products');
  private inventoryLogPath = join(process.cwd(), 'storage', 'inventory-logs');
  private inventoryPhotoPath = join(process.cwd(), 'storage', 'inventory-photos');

  constructor(private prisma: PrismaService) {
    for (const p of [this.productPath, this.inventoryLogPath, this.inventoryPhotoPath]) {
      if (!existsSync(p)) mkdirSync(p, { recursive: true });
    }
  }

  /**
   * عکس محصول — همان pipeline تاییدشده‌ی pending-operation:
   * سقف حجم، MIME مجاز، sniff و re-encode با sharp (حذف EXIF/GPS) + تامب‌نیل.
   */
  async uploadProductImage(productId: string, file: Express.Multer.File) {
    const p = await this.validateAndProcessImage(file);
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

  /** عکس لاگ انبار — همان pipeline تاییدشده. */
  async uploadInventoryLogImage(logId: string, file: Express.Multer.File) {
    const p = await this.validateAndProcessImage(file);
    const base = `${logId}-${Date.now()}-${p.sha256.slice(0, 8)}`;
    writeFileSync(join(this.inventoryLogPath, `${base}.jpg`), p.mainBuffer);
    writeFileSync(join(this.inventoryLogPath, `${base}.thumb.jpg`), p.thumbBuffer);
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
    const p = await this.validateAndProcessImage(file);

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
    writeFileSync(join(this.inventoryPhotoPath, `${base}.thumb.jpg`), p.thumbBuffer);

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

  /**
   * Pipeline مشترک اعتبارسنجی + پردازش برای همه‌ی آپلودهای عکس:
   * سقف حجم، MIME مجاز، sniff ماجیک‌بایت و re-encode با sharp — جهت‌گیری درست
   * می‌شود و EXIF (شامل GPS) با تبدیل به JPEG حذف می‌شود؛ خروجی اصلی + تامب‌نیل
   * به‌همراه ابعاد فایلِ ذخیره‌شده و sha256 برمی‌گردد.
   */
  private async validateAndProcessImage(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('فایلی دریافت نشد');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('حجم عکس بیش از حد مجاز است');
    }
    if (!ALLOWED_MIME.has(file.mimetype) || !this.sniffImage(file.buffer)) {
      throw new BadRequestException('فرمت عکس نامعتبر است (فقط JPEG یا WebP)');
    }

    let mainBuffer: Buffer;
    let thumbBuffer: Buffer;
    let width: number | undefined;
    let height: number | undefined;
    try {
      mainBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      // Dimensions of the STORED file, not the source.
      const outMeta = await sharp(mainBuffer).metadata();
      width = outMeta.width;
      height = outMeta.height;
      thumbBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
    } catch {
      throw new BadRequestException('عکس قابل پردازش نیست');
    }

    const sha256 = createHash('sha256').update(mainBuffer).digest('hex');
    return { mainBuffer, thumbBuffer, width, height, sha256 };
  }

  /** Resolve an asset's on-disk file for authenticated streaming (role-gated). */
  async getAssetFile(assetId: string, variant: 'full' | 'thumb') {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { path: true, thumbnailPath: true, mimeType: true },
    });
    if (!asset) throw new NotFoundException('عکس پیدا نشد');

    const rel =
      variant === 'thumb' ? asset.thumbnailPath ?? asset.path : asset.path;
    // Stored paths are "/storage/...". Map back to the on-disk absolute path.
    const absolute = join(process.cwd(), rel.replace(/^\//, ''));
    if (!existsSync(absolute)) throw new NotFoundException('فایل عکس موجود نیست');

    return { absolute, mimeType: asset.mimeType ?? 'image/jpeg' };
  }

  /** Magic-byte check — don't trust the client-declared MIME alone. */
  private sniffImage(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isWebp =
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP';
    return isJpeg || isWebp;
  }
}
