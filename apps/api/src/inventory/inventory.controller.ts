import { Controller, Get, Post, Body, Param } from '@nestjs/common';

import { ScanBarcodeDto } from './dto/scan-barcode.dto';
import { ScanOutDto } from './dto/scan-out.dto';
import { InventoryService } from './inventory.service';
import { VoiceInventoryService } from './voice-inventory.service';

import { VoiceInventoryDto } from './dto/voice-inventory.dto';


@Controller('inventory')
export class InventoryController {


  constructor(
    private readonly service: InventoryService,
    private readonly voiceService: VoiceInventoryService
  ) {}



  // اسکن بارکد کالا
  @Post('scan')
  scan(
    @Body() dto: ScanBarcodeDto
  ){

    return this.service.scan(
      dto.barcode
    );

  }





  // موجودی فعلی کل انبار
  @Get('current-stock')
  getCurrentStock(){

    return this.service.getStock();

  }




  // لیست موجودی کالاها
  @Get('stock')
  stock(){

    return this.service.getStock();

  }




  // موجودی بر اساس موقعیت
  @Get('location/:locationId')
  findByLocation(
    @Param('locationId') locationId:string
  ){

    return this.service.findByLocation(locationId);

  }




  // همه لاگ‌ها
  @Get('logs')
  logs(){

    return this.service.getLogs();

  }




  // لاگ یک عملیات
  @Get('logs/:id')
  log(
    @Param('id') id:string
  ){

    return this.service.getLog(id);

  }





  // موجودی یک کالا در یک موقعیت خاص
  @Get(':productId/:locationId')
  findOne(
    @Param('productId') productId:string,
    @Param('locationId') locationId:string
  ){

    return this.service.findOne(
      productId,
      locationId
    );

  }





  // ثبت ورود دستی
  @Post()
  create(
    @Body() dto:any
  ){

    return this.service.create(dto);

  }





  // ثبت صوتی
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





  // خروج کالا
  @Post('out')
  out(
    @Body() dto:any
  ){

    return this.service.out(dto);

  }

@Post('scan-out')
scanOut(
  @Body() dto:ScanOutDto
){

  return this.service.scanOut(dto);

}
}