import { Controller, Post, Get, Body, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { InventoryCountService } from './inventory-count.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { AddItemDto } from './dto/add-item.dto';

@Controller('inventory-count')
export class InventoryCountController {

  constructor(
    private readonly service: InventoryCountService
  ) {}


  @Post()
  create(
    @Body() dto: CreateInventoryCountDto
  ) {
    return this.service.create(dto);
  }


  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddItemDto
  ) {
    return this.service.addItem(id, dto);
  }


  @Get(':id')
  findOne(
    @Param('id') id: string
  ) {
    return this.service.findOne(id);
  }


  @Patch(':id/finish')
  finish(
    @Param('id') id: string
  ) {
    return this.service.finish(id);
  }


@Post(':id/apply')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
apply(
  @Param('id') id:string
) {
  return this.service.apply(id);
}
}
