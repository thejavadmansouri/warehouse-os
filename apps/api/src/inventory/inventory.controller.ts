import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Query,
} from '@nestjs/common';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { ScanBarcodeDto } from './dto/scan-barcode.dto';
import { ScanOutDto } from './dto/scan-out.dto';
import { VoiceInventoryDto } from './dto/voice-inventory.dto';
import { QueryInventoryLogsDto } from './dto/query-inventory-logs.dto';

import { InventoryService } from './inventory.service';
import { VoiceInventoryService } from './voice-inventory.service';


@Controller('inventory')
export class InventoryController {


  constructor(
    private readonly service: InventoryService,
    private readonly voiceService: VoiceInventoryService
  ) {}



  // اسکن بارکد کالا
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('scan')
  scan(
    @Body() dto: ScanBarcodeDto
  ){
    return this.service.scan(
      dto.barcode
    );
  }



  // موجودی کل
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('current-stock')
  getCurrentStock(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ){
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.service.getStock(p, l);
  }



  // لیست موجودی
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('stock')
  stock(){
    return this.service.getStock();
  }



  // موجودی یک موقعیت
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get('location/:locationId')
  findByLocation(
    @Param('locationId') locationId:string
  ){
    return this.service.findByLocation(locationId);
  }



  // لاگ‌ها
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('logs')
  logs(@Query() query: QueryInventoryLogsDto){
    return this.service.getLogs(query);
  }



  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('logs/:id')
  log(
    @Param('id') id:string
  ){
    return this.service.getLog(id);
  }



  // موجودی یک کالا در یک مکان
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
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



  // ورود کالا
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post()
  create(
    @Body() dto:any,
    @Req() req:any
  ){
    return this.service.create({
      ...dto,
      userId:req.user.userId
    });
  }



  // ثبت صوتی
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('voice')
  voice(
    @Body() dto: VoiceInventoryDto,
    @Req() req: any
  ) {
    const userId = req.user?.userId;
    return this.voiceService.process(
      dto.locationBarcode,
      dto.text,
      dto.sessionId,
      userId
    );
  }

  // پیش‌نمایش صوتی: parse + match بدون ثبت (propose، نه auto-commit)
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('voice/preview')
  voicePreview(
    @Body() dto: VoiceInventoryDto
  ) {
    return this.voiceService.preview(
      dto.locationBarcode,
      dto.text,
      dto.sessionId
    );
  }



  // تعدیل دستی موجودی (ADJUST)
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('adjust')
  adjust(
    @Body() dto:any,
    @Req() req:any
  ){
    return this.service.adjust({
      ...dto,
      userId:req.user.userId
    });
  }



  // تایید انتخاب دستی محصول بعد از needSelection
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('voice/confirm')
  voiceConfirm(
    @Body() dto:any,
    @Req() req:any
  ){
    return this.voiceService.confirm({
      ...dto,
      userId:req.user.userId
    });
  }



  // اسکن بارکد برای فروش: کالا + موجودی در یک درخواست
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('sale/resolve/:barcode')
  resolveForSale(@Param('barcode') barcode: string) {
    return this.service.resolveForSale(barcode);
  }

  // موجودیِ یک کالا به تفکیک مکان (برای صفحه‌ی فروش)
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('product/:productId/stock')
  productStock(@Param('productId') productId: string) {
    return this.service.stockByProduct(productId);
  }

  // خروج/فروش کالا — مدیر/ادمین/فروشنده (کاهش موجودی = حرکت پولی)
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('out')
  out(
    @Body() dto:any,
    @Req() req:any
  ){
    return this.service.out({
      ...dto,
      userId:req.user.userId
    });
  }



  // خروج با اسکن
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('scan-out')
  scanOut(
    @Body() dto:ScanOutDto,
    @Req() req:any
  ){
    return this.service.scanOut({
      ...dto,
      userId:req.user.userId
    });
  }

}
