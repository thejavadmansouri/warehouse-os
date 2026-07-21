import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('children')
  findChildren(@Query('parentId') parentId?: string) {
    return this.service.findChildren(parentId ?? null);
  }

  @Get('resolve/:barcode')
  resolveByBarcode(@Param('barcode') barcode: string) {
    return this.service.resolveByBarcode(barcode);
  }

  @Get(':id/path')
  getPath(@Param('id') id: string) {
    return this.service.getPath(id);
  }

  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.service.create(dto);
  }
}
