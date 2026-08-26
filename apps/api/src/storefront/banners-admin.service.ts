import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Express } from 'express';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from '../prisma/prisma.service';
import { ImagePipeline } from '../common/image-pipeline';
import { BannerMetaDto } from './dto/banner-admin.dto';

/**
 * مدیریتِ بنر — **فقط سرور سایت** (`APP_ROLE=site`).
 *
 * بنر محتوای سایت است و در دیتابیسِ سایت زندگی می‌کند؛ ساختنش روی سرور انبار
 * یعنی نوشتن در دیتابیسی که ایجنتِ سینک هرگز آن را به سایت نمی‌برد.
 *
 * عکس با همان `ImagePipeline`ِ تاییدشده پردازش و در `/storage/banners` نوشته
 * می‌شود — عمداً وابسته به `UploadsModule` نیست، چون آن ماژول انبار-only است.
 */
@Injectable()
export class BannersAdminService {
  private bannerPath = join(process.cwd(), 'storage', 'banners');

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagePipeline,
  ) {
    if (!existsSync(this.bannerPath)) mkdirSync(this.bannerPath, { recursive: true });
  }

  /** پردازش + نوشتنِ فایلِ بنر روی دیسک. */
  private async storeImage(file: Express.Multer.File) {
    const p = await this.images.process(file);
    const base = `banner-${Date.now()}-${p.sha256.slice(0, 8)}`;
    writeFileSync(join(this.bannerPath, `${base}.jpg`), p.mainBuffer);
    writeFileSync(join(this.bannerPath, `${base}.thumb.jpg`), p.thumbBuffer);
    return {
      imageUrl: `/storage/banners/${base}.jpg`,
      thumbnailUrl: `/storage/banners/${base}.thumb.jpg`,
    };
  }

  list() {
    return this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(file: Express.Multer.File | undefined, dto: BannerMetaDto) {
    if (!file) throw new BadRequestException({ error: 'IMAGE_REQUIRED', message: 'عکس بنر لازم است' });
    const img = await this.storeImage(file);
    return this.prisma.banner.create({
      data: {
        title: dto.title || null,
        linkUrl: dto.linkUrl || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        imageUrl: img.imageUrl,
        thumbnailUrl: img.thumbnailUrl,
      },
    });
  }

  /** فقط متادیتا — عکس با مسیرِ جدا عوض می‌شود. */
  async update(id: string, dto: BannerMetaDto) {
    await this.mustExist(id);
    return this.prisma.banner.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title || null : undefined,
        linkUrl: dto.linkUrl !== undefined ? dto.linkUrl || null : undefined,
        sortOrder: dto.sortOrder ?? undefined,
        isActive: dto.isActive ?? undefined,
        startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
        endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
      },
    });
  }

  async replaceImage(id: string, file: Express.Multer.File | undefined) {
    const existing = await this.mustExist(id);
    if (!file) throw new BadRequestException({ error: 'IMAGE_REQUIRED', message: 'عکس لازم است' });
    const img = await this.storeImage(file);
    this.unlinkQuiet(existing.imageUrl);
    this.unlinkQuiet(existing.thumbnailUrl);
    return this.prisma.banner.update({
      where: { id },
      data: { imageUrl: img.imageUrl, thumbnailUrl: img.thumbnailUrl },
    });
  }

  async remove(id: string) {
    const existing = await this.mustExist(id);
    await this.prisma.banner.delete({ where: { id } });
    this.unlinkQuiet(existing.imageUrl);
    this.unlinkQuiet(existing.thumbnailUrl);
    return { ok: true };
  }

  private async mustExist(id: string) {
    const b = await this.prisma.banner.findUnique({ where: { id } });
    if (!b) throw new NotFoundException({ error: 'NOT_FOUND', message: 'بنر یافت نشد' });
    return b;
  }

  /** فایلِ روی دیسک را پاک می‌کند؛ نبودنش خطا نیست (رکورد مهم‌تر از فایل است). */
  private unlinkQuiet(url: string | null) {
    if (!url) return;
    try {
      const abs = join(process.cwd(), url.replace(/^\//, ''));
      if (existsSync(abs)) unlinkSync(abs);
    } catch {
      /* بی‌صدا؛ حذفِ رکورد نباید به‌خاطرِ فایل بشکند */
    }
  }
}
