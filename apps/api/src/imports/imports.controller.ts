import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { ConfirmImportDto } from './dto/confirm-import.dto';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.importsService.parseAndPreview(file);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/confirm')
  async confirmImport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmImportDto,
  ) {
    return this.importsService.confirmImport(id, dto);
  }
}
