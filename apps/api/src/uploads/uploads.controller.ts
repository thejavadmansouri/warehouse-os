import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';

import {
  FileInterceptor
} from '@nestjs/platform-express';

import { UploadsService } from './uploads.service';


@Controller('uploads')
export class UploadsController {


  constructor(
    private uploadsService: UploadsService
  ){}



  @Post('product/:id/image')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async uploadProductImage(
    @Param('id') id:string,
    @UploadedFile() file:any
  ){

    return this.uploadsService.uploadProductImage(
      id,
      file
    );

  }




  @Post('inventory-log/:id/image')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async uploadInventoryLogImage(
    @Param('id') id:string,
    @UploadedFile() file:any
  ){

    return this.uploadsService.uploadInventoryLogImage(
      id,
      file
    );

  }


}
