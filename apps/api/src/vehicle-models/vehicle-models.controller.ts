import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { VehicleModelsService } from './vehicle-models.service';

@Controller('vehicle-models')
export class VehicleModelsController {
  constructor(private service: VehicleModelsService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
