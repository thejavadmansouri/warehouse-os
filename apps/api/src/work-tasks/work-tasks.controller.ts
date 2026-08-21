import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';

import { Role, WorkTaskStatus } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import {
  WorkTasksService,
  CreateWorkTaskLine,
  SyncMutation,
} from './work-tasks.service';

@Controller('work-tasks')
export class WorkTasksController {
  constructor(private readonly service: WorkTasksService) {}

  /** فروشنده/مدیر یک کارِ چندقلمی برای کارگر می‌سازد — موجودی دست نمی‌خورد. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post()
  create(
    @Body()
    body: {
      warehouseId: string;
      lines: CreateWorkTaskLine[];
      invoiceId?: string;
      quotationId?: string;
      assignedToId?: string | null;
      note?: string;
      idempotencyKey?: string;
    },
    @Req() req: any,
  ) {
    return this.service.create(body, req.user?.userId);
  }

  /** صف کارهای همین کارگر — تخصیصی + بدون‌تخصیص، با پیشرفت. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  /** فهرست کارگرها برای انتخابگرِ گیرنده در صندوق. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('workers')
  workers() {
    return this.service.listWorkers();
  }


  @Get('mine')
  mine(@Req() req: any, @Query('warehouseId') warehouseId?: string) {
    return this.service.findForWorker(req.user.userId, warehouseId);
  }

  /** نمای فروشنده/مدیر — همه‌ی کارها + پیشرفت برای POS. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get()
  list(
    @Query('status') status?: WorkTaskStatus,
    @Query('warehouseId') warehouseId?: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    return this.service.findMany({
      status: this.isWorkTaskStatus(status) ? status : undefined,
      warehouseId,
      invoiceId,
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  /** تیک‌های آفلاین کارگر — batch با idempotency؛ موجودی دست نمی‌خورد. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Post('sync')
  sync(@Body() body: { mutations?: SyncMutation[] }, @Req() req: any) {
    return this.service.syncMutations(req.user.userId, body?.mutations ?? []);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.cancel(id, body?.reason);
  }

  private isWorkTaskStatus(v: unknown): v is WorkTaskStatus {
    return (
      typeof v === 'string' &&
      (['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as string[]).includes(v)
    );
  }
}
