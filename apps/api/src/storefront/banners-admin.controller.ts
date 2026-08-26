import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Express } from 'express';

import { Roles } from '../auth/roles.decorator';
import { BannersAdminService } from './banners-admin.service';
import { BannerMetaDto } from './dto/banner-admin.dto';

const IMAGE = { limits: { fileSize: 5 * 1024 * 1024 } };

/**
 * مدیریتِ بنر در پنل — عمومی نیست: `JwtAuthGuard` سراسری + `@Roles`.
 * خواندنِ عمومیِ بنرها مسیرِ جداست: `GET /shop/banners`.
 */
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('banners')
export class BannersAdminController {
  constructor(private readonly banners: BannersAdminService) {}

  @Get()
  list() {
    return this.banners.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', IMAGE))
  create(@UploadedFile() file: Express.Multer.File, @Body() dto: BannerMetaDto) {
    return this.banners.create(file, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BannerMetaDto) {
    return this.banners.update(id, dto);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image', IMAGE))
  replaceImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.banners.replaceImage(id, file);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.banners.remove(id);
  }
}
