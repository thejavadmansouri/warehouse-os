import { Module } from '@nestjs/common';

import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

import { PrismaModule } from '../prisma/prisma.module';
import { ImagePipeline } from '../common/image-pipeline';

@Module({
  imports: [PrismaModule],

  controllers: [UploadsController],

  providers: [UploadsService, ImagePipeline],

  exports: [UploadsService],
})
export class UploadsModule {}
