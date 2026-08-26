import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { StockNotifyAdminService } from './stock-notify-admin.service';

/** صفِ «موجود شد خبرم کن» در پنلِ سایت — `JwtAuthGuard` سراسری + `@Roles`. */
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('stock-notify')
export class StockNotifyAdminController {
  constructor(private readonly stockNotify: StockNotifyAdminService) {}

  @Get('pending')
  pending() {
    return this.stockNotify.listPending();
  }

  @Post(':productId/send')
  send(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.stockNotify.send(productId);
  }
}
