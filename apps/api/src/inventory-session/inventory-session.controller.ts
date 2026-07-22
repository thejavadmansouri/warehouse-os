import { 
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param
} from '@nestjs/common';

import { InventorySessionService } from './inventory-session.service';


@Controller('inventory-session')
export class InventorySessionController {


  constructor(
    private service: InventorySessionService
  ){}



  @Post('start')
  start(
    @Body() dto:any
  ){

    return this.service.start(
      dto.warehouseId,
      dto.userId
    );

  }



  @Post('location')
  addLocation(
    @Body() dto:any
  ){

    return this.service.addLocation(
      dto.sessionId,
      dto.locationBarcode
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
