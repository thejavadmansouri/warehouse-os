import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { SmsService } from './sms.service';

@Controller('sms')
export class SmsController {
  constructor(private readonly service: SmsService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('templates')
  templates() {
    return this.service.listTemplatesWithMeta();
  }

  /**
   * متنِ نهایی پیش از ارسال.
   *
   * فروشنده هم می‌بیند چون ممکن است پشت پیشخوان رسیدِ دریافت بفرستد؛ ولی
   * ارسالِ واقعی دستِ مدیر است.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('preview/:customerId/:templateKey')
  preview(
    @Param('customerId') customerId: string,
    @Param('templateKey') templateKey: string,
    @Query() extra: Record<string, string>,
  ) {
    return this.service.preview(customerId, templateKey, extra);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('send')
  send(@Body() dto: { customerId: string; templateKey: string; body: string }) {
    return this.service.queue(dto);
  }

  /** خالی‌کردن صف — از پنل، تا مدیر منتظر زمان‌بندی نماند. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('drain')
  drain() {
    return this.service.drain();
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('history/:customerId')
  history(@Param('customerId') customerId: string) {
    return this.service.history(customerId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.service.retry(id);
  }

  /**
   * ویرایش قالب — عنوان، متن یا وضعیت. `key` هرگز قابل تغییر نیست.
   */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: { title?: string; body?: string; isActive?: boolean },
  ) {
    return this.service.updateTemplate(id, dto);
  }
}
