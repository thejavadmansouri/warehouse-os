import { Body, Controller, Get, Put } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { ShopService } from './shop.service';
import { ShopSettingsDto } from './dto/shop-settings.dto';


@Controller('shop-settings')
export class ShopController {

  constructor(private readonly shop: ShopService) {}


  // خواندن برای همه‌ی نقش‌ها: صفحه‌ی چاپ فاکتور را فروشنده هم باز می‌کند.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Get()
  get(){
    return this.shop.get();
  }


  // نوشتن فقط مدیر — شماره کارت روی هر فاکتوری چاپ می‌شود.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Put()
  update(@Body() dto: ShopSettingsDto){
    return this.shop.update(dto);
  }
}
