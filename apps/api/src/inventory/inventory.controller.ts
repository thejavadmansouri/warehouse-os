import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { VoiceInventoryService } from './voice-inventory.service';
import { VoiceInventoryDto } from './dto/voice-inventory.dto';


@Controller('inventory')
export class InventoryController {


  constructor(
    private readonly service: InventoryService,
    private readonly voiceService: VoiceInventoryService
  ) {}



  @Get('current-stock')
  getCurrentStock(){

    return this.service.getStock();

  }




  @Get('location/:locationId')
  findByLocation(
    @Param('locationId') locationId:string
  ){

    return this.service.findByLocation(locationId);

  }




  @Post()
  create(
    @Body() dto:any
  ){

    return this.service.create(dto);

  }





  @Post('voice')
  voice(
    @Body() dto:VoiceInventoryDto
  ){

return this.voiceService.process(
  dto.locationBarcode,
  dto.text,
  dto.sessionId
);
  }



  @Post('out')
  out(
    @Body() dto:any
  ){
    return this.service.out(dto);
  }



  @Get('stock')
  stock(){

    return this.service.getStock();

  }




  @Get('logs/:id')
  log(
    @Param('id') id:string
  ){

    return this.service.getLog(id);

  }


  @Get('logs')
  logs(){

    return this.service.getLogs();

  }


}
