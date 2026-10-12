import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SuppliersService, type SupplierInput } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private service: SuppliersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: SupplierInput) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SupplierInput>) {
    return this.service.update(id, dto);
  }
}
