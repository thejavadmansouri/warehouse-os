import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  Req,
  UseGuards
} from '@nestjs/common';

import { BarcodeService } from './barcode.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';


@Controller('barcode')
export class BarcodeController {

  constructor(
    private readonly barcodeService: BarcodeService
  ) {}


  @Get('lookup/:barcode')
  lookup(
    @Param('barcode') barcode:string
  ){

    return this.barcodeService.lookup(barcode);

  }


  @UseGuards(JwtAuthGuard)
  @Post('operation')
  operation(
    @Body() dto:any,
    @Req() req:any
  ){

    return this.barcodeService.operation(dto, req.user.userId);

  }



  @Post('operation-with-image')
  @UseInterceptors(FileInterceptor('file'))
  async operationWithImage(
    @Body() dto:any,
    @UploadedFile() file:any
  ){

    return this.barcodeService.operation(
      {
        ...dto,
        image:file ? `/storage/inventory-logs/${file.filename}` : null
      }
    );

  }


  @Post('scan')
  scan(
    @Body() dto:any
  ){

    return this.barcodeService.scan(dto);

  }

}
