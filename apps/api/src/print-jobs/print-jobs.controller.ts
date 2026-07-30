import { Controller, Get, Param, Post } from '@nestjs/common';
import { PrintJobsService } from './print-jobs.service';

@Controller('print-jobs')
export class PrintJobsController {

  constructor(
    private readonly service: PrintJobsService,
  ) {}

  @Get()
  getJobs() {
    return this.service.getJobs();
  }

  @Post(':id/run')
  runJob(
    @Param('id') id: string,
  ) {
    return this.service.runJob(id);
  }
}
