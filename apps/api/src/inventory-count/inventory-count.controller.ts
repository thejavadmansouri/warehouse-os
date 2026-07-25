import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';

import { InventoryCountService } from './inventory-count.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { AddItemDto } from './dto/add-item.dto';


@Controller('inventory-count')
export class InventoryCountController {


  constructor(
    private readonly service: InventoryCountService
  ) {}



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post()
  create(
    @Body() dto: CreateInventoryCountDto
  ) {
    return this.service.create(dto);
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddItemDto
  ) {
    return this.service.addItem(id, dto);
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get()
  findAll() {
    return this.service.findAll();
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get(':id')
  findOne(
    @Param('id') id: string
  ) {
    return this.service.findOne(id);
  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Patch(':id/finish')
  finish(
    @Param('id') id: string
  ) {
    return this.service.finish(id);
  }



  @Roles(Role.ADMIN, Role.MANAGER)
  @Post(':id/apply')
  apply(
    @Param('id') id:string
  ) {
    return this.service.apply(id);
  }

}
