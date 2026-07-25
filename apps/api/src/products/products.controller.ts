import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';


@Controller('products')
export class ProductsController {

  constructor(
    private readonly productsService: ProductsService
  ) {}


  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  findAll() {
    return this.productsService.findAll();
  }


  @Get('search')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  search(
    @Query('q') q: string
  ) {
    return this.productsService.search(q);
  }


  @Get('export')
  @Roles(Role.ADMIN, Role.MANAGER)
  async exportCsv(@Res() res: Response) {
    const csv = await this.productsService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=products-export.csv');
    res.send(csv);
  }


  @Get('barcode/:barcode')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  detailByBarcode(
    @Param('barcode') barcode:string
  ){
    return this.productsService.detailByBarcode(barcode);
  }


  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  findOne(
    @Param('id') id: string
  ) {
    return this.productsService.findOne(id);
  }


  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(
    @Body() dto: CreateProductDto
  ) {
    return this.productsService.create(dto);
  }


  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto
  ) {
    return this.productsService.update(id, dto);
  }


  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(
    @Param('id') id: string
  ) {
    return this.productsService.remove(id);
  }

}
