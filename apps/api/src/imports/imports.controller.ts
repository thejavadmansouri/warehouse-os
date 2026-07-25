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

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.importsService.parseAndPreview(file);
  }

  @Post(':id/confirm')
  async confirmImport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmImportDto,
  ) {
    return this.importsService.confirmImport(id, dto);
  }
}
