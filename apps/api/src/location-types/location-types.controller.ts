import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { LocationTypesService } from './location-types.service';
import { CreateLocationTypeDto } from './dto/create-location-type.dto';

@Controller('location-types')
export class LocationTypesController {
  constructor(private readonly service: LocationTypesService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  @Get()
  findAll(@Query('warehouseId') warehouseId?: string) {
    return this.service.findAll(warehouseId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(@Body() dto: CreateLocationTypeDto) {
    return this.service.create(dto);
  }
}
