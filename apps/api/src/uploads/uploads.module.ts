import { Module } from '@nestjs/common';

import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

import { PrismaModule } from '../prisma/prisma.module';
import { ImagePipeline } from '../common/image-pipeline';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [PrismaModule, ProductImagesModule],

  controllers: [UploadsController],

  providers: [UploadsService, ImagePipeline],

  exports: [UploadsService],
})
export class UploadsModule {}
