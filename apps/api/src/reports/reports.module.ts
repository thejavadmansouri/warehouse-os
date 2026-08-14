import { Module } from '@nestjs/common';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { LedgerService } from '../sales/ledger.service';
import { PrismaService } from '../prisma/prisma.service';


@Module({
  controllers: [ReportsController],
  providers: [PrismaService, ReportsService, LedgerService],
  exports: [ReportsService],
})

export class ReportsModule {}
