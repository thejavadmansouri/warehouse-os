import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { PurchasesService } from './purchases.service';
import {
  CancelPurchaseDto,
  CreatePurchaseDto,
  QueryPurchasesDto,
} from './dto/create-purchase.dto';


/**
 * فاکتور خرید — همه‌ی روت‌ها فقط مدیر.
 *
 * این اندپوینت هم موجودی را زیاد می‌کند و هم قیمتِ خریدِ کالا را تعیین می‌کند
 * (که مستقیم روی گزارش سود می‌نشیند). هیچ‌کدام کارِ انباردار یا فروشنده نیست.
 */
@Controller('purchases')
export class PurchasesController {

  constructor(private readonly purchases: PurchasesService) {}


  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(
    @Body() dto: CreatePurchaseDto,
    @Req() req: any,
  ){
    return this.purchases.create(dto, req.user?.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get()
  findAll(
    @Query() q: QueryPurchasesDto,
  ){
    return this.purchases.findAll(q);
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get(':id')
  findOne(
    @Param('id') id: string,
  ){
    return this.purchases.findOne(id);
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPurchaseDto,
    @Req() req: any,
  ){
    return this.purchases.cancel(id, dto.reason, req.user?.userId);
  }
}
