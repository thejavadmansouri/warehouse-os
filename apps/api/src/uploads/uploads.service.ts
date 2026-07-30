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

  async uploadProductImage(productId: string, file: Express.Multer.File) {
    const filename = `${productId}-${Date.now()}.jpg`;
    const filepath = join(this.productPath, filename);
    writeFileSync(filepath, file.buffer);
    const image = `/storage/products/${filename}`;
    return this.prisma.asset.create({
      data: { path: image, type: 'PRODUCT_IMAGE', productId },
    });
  }

  async uploadInventoryLogImage(logId: string, file: Express.Multer.File) {
    const filename = `${logId}-${Date.now()}.jpg`;
    const filepath = join(this.inventoryLogPath, filename);
    writeFileSync(filepath, file.buffer);
    const image = `/storage/inventory-logs/${filename}`;
    return this.prisma.asset.create({
      data: { path: image, type: 'INVENTORY_IMAGE', inventoryLogId: logId },
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
    if (!file?.buffer?.length) {
      throw new BadRequestException('فایلی دریافت نشد');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('حجم عکس بیش از حد مجاز است');
    }
    if (!ALLOWED_MIME.has(file.mimetype) || !this.sniffImage(file.buffer)) {
      throw new BadRequestException('فرمت عکس نامعتبر است (فقط JPEG یا WebP)');
    }

    const op = await this.prisma.pendingOperation.findUnique({
      where: { clientRequestId },
      select: { id: true, committedLogId: true },
    });
    if (!op) {
      // Op not synced yet — the client retries after the operation lands.
      throw new NotFoundException('عملیات مرتبط پیدا نشد');
    }

    // Normalise orientation and strip EXIF (incl. GPS) by re-encoding to JPEG.
    let mainBuffer: Buffer;
    let width: number | undefined;
    let height: number | undefined;
    let thumbBuffer: Buffer;
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

    // Idempotent re-upload: same op + same bytes → return the existing asset.
    const existing = await this.prisma.asset.findFirst({
      where: { pendingOperationId: op.id, sha256 },
      select: { id: true },
    });
    if (existing) return existing;

    const base = `${clientRequestId}-${sha256.slice(0, 12)}`;
    writeFileSync(join(this.inventoryPhotoPath, `${base}.jpg`), mainBuffer);
    writeFileSync(join(this.inventoryPhotoPath, `${base}.thumb.jpg`), thumbBuffer);

    return this.prisma.asset.create({
      data: {
        path: `/storage/inventory-photos/${base}.jpg`,
        thumbnailPath: `/storage/inventory-photos/${base}.thumb.jpg`,
        fileName: `${base}.jpg`,
        type: 'INVENTORY_IMAGE',
        mimeType: 'image/jpeg',
        bytes: mainBuffer.length,
        width,
        height,
        sha256,
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
