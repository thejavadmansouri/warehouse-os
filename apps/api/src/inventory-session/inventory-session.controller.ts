import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { InventorySessionService } from './inventory-session.service';


@Controller('inventory-session')
export class InventorySessionController {

  constructor(
    private service: InventorySessionService
  ){}


  @Post()
  create(
    @Body() body:any
  ){

    return this.service.create(
      body.warehouseName,
      body.userId
    );

  }


  @Get()
  active(){

    return this.service.findActive();

  }


  @Patch(':id/finish')
  finish(
    @Param('id') id:string
  ){

    return this.service.finish(id);

  }

}