import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';

import { Role, PickTaskStatus } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { PickTasksService, CreatePickTaskLine } from './pick-tasks.service';


@Controller('pick-tasks')
export class PickTasksController {

  constructor(private readonly service: PickTasksService) {}


  // فهرست کارگرها برای انتخاب گیرنده — فروشنده/مدیر با اسم می‌فرستد.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('workers')
  workers(){
    return this.service.listWorkers();
  }


  // فروشنده لوکیشن کالا(ها) را برای کارگر می‌فرستد.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post()
  create(
    @Body() body:{
      warehouseId:string;
      lines:CreatePickTaskLine[];
      invoiceId?:string;
      assignedToId?:string;
    },
    @Req() req:any,
  ){
    return this.service.create(body, req.user?.userId);
  }


  /**
   * صف کارهای کارگر — اپ اندروید این را می‌گیرد.
   * کارگر فقط کارهای بدون تخصیص یا تخصیص‌داده‌شده به خودش را می‌بیند.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Get('mine')
  mine(
    @Req() req:any,
    @Query('warehouseId') warehouseId?:string,
  ){
    return this.service.findForWorker(req.user.userId, warehouseId);
  }


  // نمای فروشنده/مدیر روی همه‌ی کارها.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get()
  list(
    @Query('status') status?:PickTaskStatus,
    @Query('warehouseId') warehouseId?:string,
    @Query('invoiceId') invoiceId?:string,
  ){
    return this.service.findMany({ status, warehouseId, invoiceId });
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Get(':id')
  findOne(
    @Param('id') id:string,
  ){
    return this.service.findOne(id);
  }


  // کارگر: «آوردم». موجودی تغییر نمی‌کند — کسر فقط هنگام ثبت فاکتور.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Post(':id/picked')
  markPicked(
    @Param('id') id:string,
    @Req() req:any,
  ){
    return this.service.markPicked(id, req.user.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post(':id/cancel')
  cancel(
    @Param('id') id:string,
    @Body() body:{ reason?:string },
  ){
    return this.service.cancel(id, body?.reason);
  }
}
