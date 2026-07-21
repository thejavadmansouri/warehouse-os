import { Controller, Get, Post, Body } from '@nestjs/common';
import { LocationTypesService } from './location-types.service';
import { CreateLocationTypeDto } from './dto/create-location-type.dto';

@Controller('location-types')
export class LocationTypesController {
  constructor(private readonly service: LocationTypesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateLocationTypeDto) {
    return this.service.create(dto);
  }
}
