import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  Req,
  Delete,
  UseGuards
} from '@nestjs/common';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { LinkBarcodeDto } from './dto/link-barcode.dto';

import { BarcodeService } from './barcode.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';


@Controller('barcode')
export class BarcodeController {

  constructor(
    private readonly barcodeService: BarcodeService
  ) {}


  // خواندنی — هر نقشی می‌تواند بارکد بزند و مشخصات کالا را ببیند.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES, Role.STAFF)
  @Get('lookup/:barcode')
  lookup(
    @Param('barcode') barcode:string
  ){

    return this.barcodeService.lookup(barcode);

  }


  /**
   * چسباندنِ بارکدِ خودِ جنس به یک کالا.
   *
   * انباردار هم اجازه دارد: او کسی است که جعبه را دستش گرفته و بارکدش را
   * می‌بیند. این مسیر هیچ عددی از موجودی را تغییر نمی‌دهد — فقط می‌گوید این
   * رشته یعنی این کالا — پس دادنش به STAFF بی‌خطر است.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post('link')
  link(
    @Body() dto: LinkBarcodeDto,
  ){
    return this.barcodeService.linkBarcode(dto.productId, dto.barcode, dto.type);
  }


  /** برداشتنِ بارکد کارِ مدیر است — اشتباهش کالا را از مسیر اسکن گم می‌کند. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('link/:id')
  unlink(
    @Param('id') id:string,
  ){
    return this.barcodeService.unlinkBarcode(id);
  }


  /*
   * سه روتِ زیر موجودی را عوض می‌کنند و تا امروز **هیچ نقشی رویشان تعریف نشده
   * بود**. چون RolesGuard وقتی متادیتا نباشد اجازه می‌دهد، هر کاربر لاگین‌شده —
   * از جمله STAFF — می‌توانست از اینجا OUT/ADJUST/TRANSFER بزند و همان محدودیتی
   * را که روی /inventory/out گذاشته شده بود دور بزند.
   *
   * پس همان محدودیت اینجا هم اعمال می‌شود، و userId در هر سه مسیر پاس داده
   * می‌شود تا ردیف لاگ عاملِ مشخص داشته باشد (قانون ۱).
   */
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseGuards(JwtAuthGuard)
  @Post('operation')
  operation(
    @Body() dto:any,
    @Req() req:any
  ){

    return this.barcodeService.operation(dto, req.user.userId);

  }



  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('operation-with-image')
  @UseInterceptors(FileInterceptor('file'))
  async operationWithImage(
    @Body() dto:any,
    @UploadedFile() file:any,
    @Req() req:any
  ){

    return this.barcodeService.operation(
      {
        ...dto,
        image:file ? `/storage/inventory-logs/${file.filename}` : null
      },
      req.user?.userId
    );

  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('scan')
  scan(
    @Body() dto:any,
    @Req() req:any
  ){

    return this.barcodeService.scan(dto, req.user?.userId);

  }

}
