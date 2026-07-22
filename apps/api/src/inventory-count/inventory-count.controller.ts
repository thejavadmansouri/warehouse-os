import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';

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
  apply(
    @Param('id') id: string
  ) {
    return this.service.apply(id);
  }

}