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

class CancelDto {
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

  /**
   * یک مرحله جلو: آماده‌سازی → ارسال → تحویل.
   *
   * عمداً «مرحله‌ی بعد» است نه «وضعیت دلخواه»: فروشنده وسط کار نباید بتواند
   * سفارشی را که هنوز جمع نشده «تحویل‌شده» بزند.
   */
  @Post(':id/advance')
  advance(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orders.advance(id, req.user?.userId);
  }

  /** لغو — جنس نبود، یا مشتری پشیمان شد. */
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
    @Req() req: any,
  ) {
    return this.orders.cancel(id, req.user?.userId, dto.reason);
  }
}
