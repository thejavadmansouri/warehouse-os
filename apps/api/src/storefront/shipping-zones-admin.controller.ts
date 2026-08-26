import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { ShippingZonesAdminService } from './shipping-zones-admin.service';
import { CreateShippingZoneDto, UpdateShippingZoneDto } from './dto/shipping-zone-admin.dto';

/** مدیریتِ مناطقِ ارسال در پنلِ سایت — `JwtAuthGuard` سراسری + `@Roles`. */
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('shipping-zones')
export class ShippingZonesAdminController {
  constructor(private readonly zones: ShippingZonesAdminService) {}

  @Get()
  list() {
    return this.zones.list();
  }

  @Post()
  create(@Body() dto: CreateShippingZoneDto) {
    return this.zones.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingZoneDto) {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.zones.remove(id);
  }
}
