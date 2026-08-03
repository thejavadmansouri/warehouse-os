import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { SalesService } from './sales.service';
import { CustomersService } from './customers.service';
import { ReceiptsService } from './receipts.service';
import { QuotationsService } from './quotations.service';
import type { CreateReceiptInput } from './receipts.service';
import type { CreateQuotationInput } from './quotations.service';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto, CancelInvoiceDto } from './dto/query-invoices.dto';


@Controller('sales')
export class SalesController {

  constructor(
    private readonly sales: SalesService,
    private readonly customers: CustomersService,
    private readonly receipts: ReceiptsService,
    private readonly quotations: QuotationsService,
  ) {}


  // ---------- دریافت وجه از بدهکار ----------

  // پول به قدیمی‌ترین فاکتور بدهکار اول تخصیص داده می‌شود.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('receipts')
  createReceipt(
    @Body() dto: CreateReceiptInput,
    @Req() req: any,
  ){
    return this.receipts.create(dto, req.user?.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('receipts')
  listReceipts(
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ){
    return this.receipts.findAll({
      customerId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('receipts/:id')
  getReceipt(
    @Param('id') id: string,
  ){
    return this.receipts.findOne(id);
  }


  // ---------- پیش‌فاکتور ----------

  // هیچ موجودی‌ای کم نمی‌کند؛ فقط قیمت را برای مدت مشخصی نگه می‌دارد.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('quotations')
  createQuotation(
    @Body() dto: CreateQuotationInput,
    @Req() req: any,
  ){
    return this.quotations.create(dto, req.user?.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('quotations')
  listQuotations(
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ){
    return this.quotations.findAll({
      status,
      customerId,
      warehouseId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('quotations/:id')
  getQuotation(
    @Param('id') id: string,
  ){
    return this.quotations.findOne(id);
  }


  // تبدیل به فاکتور — اینجا برای اولین بار موجودی بررسی و کم می‌شود.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('quotations/:id/convert')
  convertQuotation(
    @Param('id') id: string,
    @Body() body: { payments?: unknown[]; idempotencyKey?: string },
    @Req() req: any,
  ){
    return this.quotations.convert(id, body ?? {}, req.user?.userId);
  }


  // تمدید اعتبار — فقط مدیر.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('quotations/:id/extend')
  extendQuotation(
    @Param('id') id: string,
    @Body() body: { validForMinutes: number },
  ){
    return this.quotations.extend(id, body?.validForMinutes);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('quotations/:id/cancel')
  cancelQuotation(
    @Param('id') id: string,
  ){
    return this.quotations.cancel(id);
  }


  // ---------- فاکتور ----------

  // ثبت فاکتور فروش (چندردیفی، اتمیک)
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('invoices')
  createInvoice(
    @Body() dto: CreateInvoiceDto,
    @Req() req: any,
  ){
    return this.sales.createInvoice(dto, req.user?.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('invoices')
  listInvoices(
    @Query() q: QueryInvoicesDto,
  ){
    return this.sales.findAll(q);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('invoices/:id')
  getInvoice(
    @Param('id') id: string,
  ){
    return this.sales.findOne(id);
  }


  // ابطال فاکتور — فروشنده اجازه ندارد، فقط مدیر.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('invoices/:id/cancel')
  cancelInvoice(
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
    @Req() req: any,
  ){
    return this.sales.cancelInvoice(id, dto.reason, req.user?.userId);
  }


  // ---------- مشتری ----------

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers')
  searchCustomers(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ){
    return this.customers.search(
      q,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers/:id')
  getCustomer(
    @Param('id') id: string,
  ){
    return this.customers.findOne(id);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  // فقط نام لازم است — ثبت مشتری بدون شماره باید ممکن باشد.
  @Post('customers')
  createCustomer(
    @Body() body: {
      firstName:string;
      lastName?:string;
      note?:string;
      smsOptOut?:boolean;
      phones?:{ phone:string; label?:string; isPrimary?:boolean }[];
    },
  ){
    return this.customers.create(body);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('customers/:id/phones')
  addPhone(
    @Param('id') id: string,
    @Body() body: { phone:string; label?:string; isPrimary?:boolean },
  ){
    return this.customers.addPhone(id, body);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Delete('customers/:id/phones/:phoneId')
  removePhone(
    @Param('id') id: string,
    @Param('phoneId') phoneId: string,
  ){
    return this.customers.removePhone(id, phoneId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Patch('customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() body: { firstName?:string; lastName?:string; note?:string; smsOptOut?:boolean },
  ){
    return this.customers.update(id, body);
  }


  // غیرفعال‌سازی مشتری — فقط مدیر.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('customers/:id')
  deactivateCustomer(
    @Param('id') id: string,
  ){
    return this.customers.deactivate(id);
  }
}
