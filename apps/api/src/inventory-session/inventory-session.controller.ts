import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req
} from '@nestjs/common';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { InventorySessionService } from './inventory-session.service';


@Controller('inventory-session')
export class InventorySessionController {


  constructor(
    private service: InventorySessionService
  ){}



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('start')
  start(
    @Body() dto:any,
    @Req() req:any
  ){

    return this.service.start(
      dto.warehouseId,
      req.user.userId
    );

  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('location')
  addLocation(
    @Body() dto:any
  ){

    return this.service.addLocation(
      dto.sessionId,
      dto.locationBarcode
    );

  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get()
  active(){

    return this.service.findActive();

  }



  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Patch(':id/finish')
  finish(
    @Param('id') id:string
  ){

    return this.service.finish(id);

  }


}
