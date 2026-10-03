import { Module } from '@nestjs/common';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';
import { ImageSearchService } from './image-search.service';
import { ImageDownloadService } from './image-download.service';
import { ImageProcessService } from './image-process.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductImagesController],
  providers: [
    ProductImagesService,
    ImageSearchService,
    ImageDownloadService,
    ImageProcessService,
  ],
  exports: [ProductImagesService],
})
export class ProductImagesModule {}
