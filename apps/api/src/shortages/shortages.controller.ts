import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { ShortagesService } from './shortages.service';
import { CreateShortageDto, ResolveShortageDto } from './dto/create-shortage.dto';


@Controller('shortages')
export class ShortagesController {

  constructor(private readonly service: ShortagesService) {}


  /**
   * فروشنده هم ثبت می‌کند — او تنها کسی است که لحظه‌ی ازدست‌رفتنِ فروش آنجاست.
   * چون این endpoint هیچ عددی از انبار را تغییر نمی‌دهد، دادنش به SALES بی‌خطر
   * است.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post()
  create(@Body() dto: CreateShortageDto, @Req() req: any) {
    return this.service.create(dto, req.user?.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get()
  findAll(@Query() q: { status?: string; warehouseId?: string }) {
    return this.service.findAll(q);
  }


  /** تصمیم‌گیری کارِ مدیر است، نه فروشنده. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveShortageDto,
    @Req() req: any,
  ) {
    return this.service.resolve(id, dto, req.user?.userId);
  }
}
