import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { SiteAccessGuard } from '../auth/site-access.guard';
import { ShippingZonesAdminService } from './shipping-zones-admin.service';
import {
  CreateShippingZoneDto,
  UpdateShippingZoneDto,
} from './dto/shipping-zone-admin.dto';

/** مدیریتِ مناطقِ ارسال در پنلِ سایت — `JwtAuthGuard` سراسری + `SiteAccessGuard`. */
@UseGuards(SiteAccessGuard)
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
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShippingZoneDto,
  ) {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.zones.remove(id);
  }
}
