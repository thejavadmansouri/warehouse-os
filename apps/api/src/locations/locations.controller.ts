import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  // ---- خواندن: برای همه‌ی کاربران احرازشده (کارگر هم موقعیت‌ها را می‌بیند) ----

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('children')
  findChildren(
    @Query('parentId') parentId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.findChildren(parentId ?? null, warehouseId);
  }

  @Get('resolve/:barcode')
  resolveByBarcode(@Param('barcode') barcode: string) {
    return this.service.resolveByBarcode(barcode);
  }

  @Get(':id/path')
  getPath(@Param('id') id: string) {
    return this.service.getPath(id);
  }

  @Get(':id/subtree-stats')
  subtreeStats(@Param('id') id: string) {
    return this.service.getSubtreeStats(id);
  }

  // ---- تغییر ساختار: فقط مدیر/ادمین ----

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.service.create(dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('bulk-delete')
  bulkDelete(@Body() dto: { ids: string[] }) {
    return this.service.bulkRemove(dto.ids ?? []);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
