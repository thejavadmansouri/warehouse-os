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

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { QueryInvoicesDto, CancelInvoiceDto } from './dto/query-invoices.dto';


@Controller('sales')
export class SalesController {

  constructor(
    private readonly sales: SalesService,
    private readonly customers: CustomersService,
  ) {}


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
