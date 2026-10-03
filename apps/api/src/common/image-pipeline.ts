import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Express } from 'express';
import sharp from 'sharp';

/** Accepted inbound image types (worker photos are compressed JPEG on-device). */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/webp']);
/** Hard cap after client-side compression (~250 KB expected). Rejects full-res. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Longest edge for the stored image and the list thumbnail. */
const MAX_EDGE = 1600;
const THUMB_EDGE = 320;

export interface ProcessedImage {
  mainBuffer: Buffer;
  thumbBuffer: Buffer;
  width?: number;
  height?: number;
  sha256: string;
}

/**
 * Pipelineِ مشترکِ اعتبارسنجی + پردازشِ عکس: سقف حجم، MIME مجاز، sniff
 * ماجیک‌بایت و re-encode با sharp — جهت‌گیری درست می‌شود و EXIF (شامل GPS) با
 * تبدیل به JPEG حذف می‌شود؛ خروجی اصلی + تامب‌نیل با ابعاد و sha256.
 *
 * ⚠️ عمداً هیچ وابستگی‌ای به ماژول ندارد (نه Prisma، نه فایل‌سیستم) تا هم روی
 * سرور انبار (`UploadsService`) و هم روی VPS (بنرهای سایت) قابل استفاده باشد.
 * نسخه‌ی دوم از این منطق نداریم، چون این منطق امنیتی است نه صرفاً تغییر اندازه.
 */
@Injectable()
export class ImagePipeline {
  async process(file: Express.Multer.File): Promise<ProcessedImage> {
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
        .resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      // Dimensions of the STORED file, not the source.
      const outMeta = await sharp(mainBuffer).metadata();
      width = outMeta.width;
      height = outMeta.height;
      thumbBuffer = await sharp(file.buffer)
        .rotate()
        .resize({
          width: THUMB_EDGE,
          height: THUMB_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 70 })
        .toBuffer();
    } catch {
      throw new BadRequestException('عکس قابل پردازش نیست');
    }

    const sha256 = createHash('sha256').update(mainBuffer).digest('hex');
    return { mainBuffer, thumbBuffer, width, height, sha256 };
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
