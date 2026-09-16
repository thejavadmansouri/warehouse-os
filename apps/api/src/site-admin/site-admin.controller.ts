import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OnlineOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { SiteAccessGuard } from '../auth/site-access.guard';
import { SiteAdminService } from './site-admin.service';

class OrdersQueryDto {
  @IsOptional()
  @IsEnum(OnlineOrderStatus)
  status?: OnlineOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

class ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

/**
 * API پنلِ مدیرِ سایت.
 *
 * ⚠️ این کنترلر روی اینترنت است. سه قاعده‌ی غیرقابل‌مذاکره:
 *
 *   ۱. **فقط خواندن.** هیچ متدی در *این کنترلر* داده‌ای را عوض نمی‌کند.
 *      عملیات (تحویل، لغو، قیمت) کارِ پنلِ انبار است.
 *      استثنا فقط محتوای خودِ سایت است (کوپن، بنر، منطقه‌ی ارسال، تأیید نظر)
 *      که کنترلرهای جداگانه‌ی خودش را دارد در همین `SiteAdminModule` — آن‌ها
 *      می‌نویسند، ولی به هیچ داده‌ی انباری دست نمی‌زنند.
 *   ۲. **هیچ داده‌ی انباری.** قفسه، قیمت خرید، تأمین‌کننده، سود — هیچ‌کدام
 *      روی این ماشین وجود ندارند و نباید کسی وسوسه شود سینکشان کند.
 *   ۳. **پشت `SiteAccessGuard`.** گاردِ سراسری سرِ جایش است؛ اینجا `@Public()`
 *      نداریم و فقط صاحبانِ پرچمِ `canManageSite` دسترسی دارند.
 */
@UseGuards(SiteAccessGuard)
@Controller('site-admin')
export class SiteAdminController {
  constructor(private readonly site: SiteAdminService) {}

  @Get('overview')
  overview() {
    return this.site.overview();
  }

  /** «سینک زنده است؟» — اگر عددِ منتظرها بالا برود یعنی ایجنت خوابیده. */
  @Get('sync-health')
  syncHealth() {
    return this.site.syncHealth();
  }

  @Get('orders')
  orders(@Query() query: OrdersQueryDto) {
    return this.site.orders(query);
  }

  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.order(id);
  }

  @Get('customers')
  customers(@Query() query: ListQueryDto) {
    return this.site.customers(query);
  }

  @Get('products')
  products(@Query() query: ListQueryDto) {
    return this.site.products(query);
  }
}
