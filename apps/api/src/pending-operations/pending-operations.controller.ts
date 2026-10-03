import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PendingOperationsService } from './pending-operations.service';
import { SyncOperationsDto } from './dto/sync-operations.dto';
import { ApproveManyDto } from './dto/approve-many.dto';

@Controller()
export class PendingOperationsController {
  constructor(private readonly service: PendingOperationsService) {}

  // Worker app uploads its offline queue when the LAN server is reachable.
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @Post('sync/operations')
  sync(@Body() dto: SyncOperationsDto, @Req() req: any) {
    return this.service.sync(dto.operations, req.user?.userId);
  }

  // «کارهای من» — کارگر کارهای خودش و تصمیم مدیر (تأیید/رد + دلیل) را می‌بیند.
  // بدون این، کارگر فقط یک عدد «N در انتظار» می‌بیند و نمی‌داند مدیر چه کرده.
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @Get('mobile/my-work')
  myWork(@Query('since') since: string | undefined, @Req() req: any) {
    return this.service.myWork(req.user?.userId, since);
  }

  // Manager review queue (web admin).
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get('manager/review/pending')
  listPending(@Query('warehouseId') warehouseId?: string) {
    return this.service.listPending(warehouseId);
  }

  // تأیید گروهی — قبل از مسیرِ `:id/approve` تا static صریح باشد.
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('manager/review/approve-many')
  approveMany(@Body() dto: ApproveManyDto, @Req() req: any) {
    return this.service.approveMany(dto.ids, req.user?.userId);
  }

  // Approve = commit to stock (manager may override product/quantity).
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('manager/review/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: { productId?: string; quantity?: number },
    @Req() req: any,
  ) {
    return this.service.approve(id, req.user?.userId, body);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('manager/review/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { reviewNote?: string },
    @Req() req: any,
  ) {
    return this.service.reject(id, req.user?.userId, body?.reviewNote);
  }
}
