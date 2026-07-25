import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { LabelsService } from './labels.service';

@Controller('labels')
export class LabelsController {
  constructor(private service: LabelsService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('location/:id')
  locationLabel(@Param('id') id: string) {
    return this.service.locationLabel(id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('product/:id')
  productLabel(@Param('id') id: string) {
    return this.service.productLabel(id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location/bulk')
  bulkLocation(@Body() dto: { ids: string[] }) {
    return this.service.bulkLocationLabels(dto.ids);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('product/bulk')
  bulkProduct(@Body() dto: { ids: string[] }) {
    return this.service.bulkProductLabels(dto.ids);
  }
}
