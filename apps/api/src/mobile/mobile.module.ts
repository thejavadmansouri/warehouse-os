import { Module } from '@nestjs/common';

import { MobileController } from './mobile.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MobileCountService } from './mobile-count.service';
import { ParsingEngineModule } from '../engine/parsing-engine.module';


@Module({
  imports:[
    PrismaModule,
    ParsingEngineModule
  ],

  controllers:[
    MobileController
  ],

  providers:[
    MobileCountService
  ]
})
export class MobileModule {}
