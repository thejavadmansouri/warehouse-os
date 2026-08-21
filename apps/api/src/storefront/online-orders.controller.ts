import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { OnlineOrderStatus, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { Roles } from '../auth/roles.decorator';
import { OnlineOrdersService } from './online-orders.service';

class ListQueryDto {
  @IsOptional() @IsEnum(OnlineOrderStatus)
  status?: OnlineOrderStatus;
}

class RejectDto {
  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}

/**
 * صفِ سفارش‌های سایت در پنل.
 *
 * برخلاف `StorefrontController` این **عمومی نیست**: `JwtAuthGuard` سراسری
 * سرِ جایش است و `@Roles` هم دارد. عمداً یک کنترلر جداست تا هیچ‌وقت کسی
 * `@Public()` را روی صفِ کاری فروشنده نگذارد.
 */
@Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
@Controller('online-orders')
export class OnlineOrdersController {
  constructor(private readonly orders: OnlineOrdersService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.orders.list(query.status);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(id);
  }

  /** تأیید و تبدیل به فاکتور — تنها نقطه‌ای که کالا از انبار کم می‌شود. */
  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orders.confirm(id, req.user?.userId);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
    @Req() req: any,
  ) {
    return this.orders.reject(id, req.user?.userId, dto.reason);
  }
}
