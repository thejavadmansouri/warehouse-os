import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import type { Response } from 'express';
import { createReadStream } from 'fs';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('product/:id/image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProductImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadsService.uploadProductImage(id, file);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('inventory-log/:id/image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInventoryLogImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadsService.uploadInventoryLogImage(id, file);
  }

  /** Worker uploads the (compressed) photo for an offline-captured operation. */
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @Post('pending-operation/:clientRequestId/photo')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadPendingOperationPhoto(
    @Param('clientRequestId', new ParseUUIDPipe()) clientRequestId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadsService.uploadPendingOperationPhoto(clientRequestId, file);
  }

  /**
   * Authenticated photo retrieval for Manager Review. Role-gated (unlike the
   * public /storage static mount); pass ?variant=thumb for the list thumbnail.
   */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get('photo/:assetId')
  async getPhoto(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query('variant') variant: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const v = variant === 'thumb' ? 'thumb' : 'full';
    const { absolute, mimeType } = await this.uploadsService.getAssetFile(
      assetId,
      v,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(createReadStream(absolute));
  }
}
