import { Module } from '@nestjs/common';
import { PartCatalogController } from './part-catalog.controller';
import { PartCatalogService } from './part-catalog.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports:[
    PrismaModule
  ],
  controllers:[
    PartCatalogController
  ],
  providers:[
    PartCatalogService
  ],
  exports:[
    PartCatalogService
  ]
})
export class PartCatalogModule {}
