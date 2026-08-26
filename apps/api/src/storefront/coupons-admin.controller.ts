import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { CouponsAdminService } from './coupons-admin.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon-admin.dto';

/**
 * مدیریتِ کوپن در پنلِ سایت — عمومی نیست: `JwtAuthGuard` سراسری + `@Roles`.
 */
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('coupons')
export class CouponsAdminController {
  constructor(private readonly coupons: CouponsAdminService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  @Post()
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.remove(id);
  }
}
