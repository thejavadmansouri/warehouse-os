import { Module } from '@nestjs/common';

import { ParsingEngineService } from './parsing-engine.service';
import { DictionaryLoaderService } from './services/dictionary-loader.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [
    PrismaService,
    DictionaryLoaderService,
    ParsingEngineService,
  ],
  exports: [
    ParsingEngineService,
  ],
})
export class ParsingEngineModule {}
