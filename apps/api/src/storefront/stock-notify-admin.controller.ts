import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { SiteAccessGuard } from '../auth/site-access.guard';
import { StockNotifyAdminService } from './stock-notify-admin.service';

/** صفِ «موجود شد خبرم کن» در پنلِ سایت — `JwtAuthGuard` سراسری + `SiteAccessGuard`. */
@UseGuards(SiteAccessGuard)
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
