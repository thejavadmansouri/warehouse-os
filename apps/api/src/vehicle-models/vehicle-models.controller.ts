import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { VehicleModelsService } from './vehicle-models.service';

@Controller('vehicle-models')
export class VehicleModelsController {
  constructor(private service: VehicleModelsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
