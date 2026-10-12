import {
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrintJobsService } from './print-jobs.service';

@Controller('print-jobs')
export class PrintJobsController {
  constructor(private readonly service: PrintJobsService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get()
  getJobs(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.service.listJobs({ status, type });
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.service.getJob(id);
  }

  /** تأیید روی PC — چاپ واقعی لیبل کالا روی پرینتر شبکه/ویندوز. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.service.confirmProductJob(id);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancelJob(id);
  }

  /** مسیر قدیمی لیبل قفسه. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/run')
  runJob(@Param('id') id: string) {
    return this.service.runJob(id);
  }
}
