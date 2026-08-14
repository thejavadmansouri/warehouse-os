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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as XLSX from 'xlsx';

import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';

import { SalesService } from './sales.service';
import { CustomersService, type CustomerSort } from './customers.service';
import { CustomerCategoriesService } from './customer-categories.service';
import { ReceiptsService } from './receipts.service';
import { QuotationsService } from './quotations.service';
import { ReturnsService } from './returns.service';
import { LedgerService } from './ledger.service';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import {
  ConvertQuotationDto,
  CreateQuotationDto,
  ExtendQuotationDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';
import {
  CreateCustomerDto,
  CustomerPhoneDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import {
  CreateCustomerCategoryDto,
  UpdateCustomerCategoryDto,
} from './dto/customer-category.dto';
import { QueryInvoicesDto, CancelInvoiceDto } from './dto/query-invoices.dto';
import { OpeningBalanceDto, AdjustBalanceDto } from './dto/ledger.dto';


/** برچسب فارسیِ نوعِ حرکت — برای ستونِ «شرح» در خروجی اکسلِ صورتحساب. */
const STATEMENT_LABELS: Record<string, string> = {
  OPENING: 'مانده‌ی اول دوره',
  INVOICE: 'فاکتور',
  RECEIPT: 'دریافت',
  INVOICE_CANCELLED: 'ابطال فاکتور',
  RETURN: 'برگشت کالا',
  CHEQUE_BOUNCED: 'چک برگشتی',
  ADJUSTMENT: 'اصلاح حساب',
};

interface StatementOutRow {
  createdAt: Date;
  type: string;
  note: string | null;
  invoice: { id: string; number: number | null } | null;
  receipt: { id: string; number: number | null } | null;
  debit: number;
  credit: number;
  balance: number;
}

/** خروجی اکسلِ صورتحساب — سرستون فارسی، RTL، تاریخ شمسی. */
function statementToExcel(res: Response, rows: StatementOutRow[]) {
  const faDate = (d: Date) =>
    new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(d));

  const sheetRows = rows.map((r) => ({
    'تاریخ': faDate(r.createdAt),
    'شرح': [
      STATEMENT_LABELS[r.type] ?? r.type,
      r.invoice && r.invoice.number != null ? `#${r.invoice.number}` : null,
      r.receipt && r.receipt.number != null ? `#${r.receipt.number}` : null,
      r.note ?? null,
    ].filter(Boolean).join(' '),
    'بدهکار': r.debit || '',
    'بستانکار': r.credit || '',
    'مانده': r.balance,
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws['!views'] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'statement');
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="statement.xlsx"');
  return res.send(buf);
}


@Controller('sales')
export class SalesController {

  constructor(
    private readonly sales: SalesService,
    private readonly customers: CustomersService,
    private readonly categories: CustomerCategoriesService,
    private readonly receipts: ReceiptsService,
    private readonly quotations: QuotationsService,
    private readonly returns: ReturnsService,
    private readonly ledger: LedgerService,
  ) {}


  // ---------- دریافت وجه از بدهکار ----------

  // پول به قدیمی‌ترین فاکتور بدهکار اول تخصیص داده می‌شود.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('receipts')
  createReceipt(
    @Body() dto: CreateReceiptDto,
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
    @Body() dto: CreateQuotationDto,
    @Req() req: any,
  ){
    return this.quotations.create(dto, req.user?.userId);
  }


  // ویرایش پیش‌فاکتور فعال — اقلام، قیمت‌ها و مشتری.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Patch('quotations/:id')
  updateQuotation(
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
  ){
    return this.quotations.update(id, dto);
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
    @Body() body: ConvertQuotationDto,
    @Req() req: any,
  ){
    return this.quotations.convert(id, body ?? {}, req.user?.userId);
  }


  // تمدید اعتبار — فقط مدیر.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('quotations/:id/extend')
  extendQuotation(
    @Param('id') id: string,
    @Body() body: ExtendQuotationDto,
  ){
    return this.quotations.extend(id, body.validForMinutes);
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


  // ردیف‌های قابل‌برگشتِ یک فاکتور — خوراکِ صفحه‌ی مرجوعی.
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('invoices/:id/returnable')
  returnable(
    @Param('id') id: string,
  ){
    return this.returns.returnableLines(id);
  }


  // ---------- برگشت از فروش (مرجوعی) ----------

  // ثبت مرجوعی — مثل ابطال، فقط مدیر: وجه/بدهی برمی‌گردد و موجودی جابه‌جا می‌شود.
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('returns')
  createReturn(
    @Body() dto: CreateReturnDto,
    @Req() req: any,
  ){
    return this.returns.createReturn(dto, req.user?.userId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('returns')
  listReturns(
    @Query('warehouseId') warehouseId?: string,
    @Query('customerId') customerId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ){
    return this.returns.findAll({
      warehouseId,
      customerId,
      invoiceId,
      from,
      to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('returns/:id')
  getReturn(
    @Param('id') id: string,
  ){
    return this.returns.findOne(id);
  }


  // ---------- مشتری ----------

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers')
  searchCustomers(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('categoryId') categoryId?: string,
  ){
    return this.customers.search(
      q,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
      sortBy as CustomerSort | undefined,
      categoryId,
    );
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers/:id')
  getCustomer(
    @Param('id') id: string,
  ){
    return this.customers.findOne(id);
  }


  /**
   * آمار خرید دوره‌ای مشتری — این ماه، ماه قبل، کل و میانگین فاکتور.
   * برای کارت‌های خلاصه‌ی پرونده‌ی مشتری.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers/:id/stats')
  customerStats(
    @Param('id') id: string,
  ){
    return this.customers.purchaseStats(id);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  // فقط نام لازم است — ثبت مشتری بدون شماره باید ممکن باشد.
  @Post('customers')
  createCustomer(
    @Body() body: CreateCustomerDto,
  ){
    return this.customers.create(body);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('customers/:id/phones')
  addPhone(
    @Param('id') id: string,
    @Body() body: CustomerPhoneDto,
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


  /**
   * تعیین شماره‌ی اصلی مشتری — بقیه‌ی شماره‌های همین مشتری غیراصلی می‌شوند.
   * در تراکنش انجام می‌شود تا هیچ‌وقت دو شماره‌ی اصلی کنار هم ننشینند.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('customers/:id/phones/:phoneId/primary')
  setPrimaryPhone(
    @Param('id') id: string,
    @Param('phoneId') phoneId: string,
  ){
    return this.customers.setPrimaryPhone(id, phoneId);
  }


  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Patch('customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
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


  // ---------- دسته‌های مشتری ----------

  /** همه‌ی دسته‌ها با شمارش مشتری — صفحه‌ی مدیریت. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('customer-categories')
  customerCategories(){
    return this.categories.list();
  }


  /** فقط دسته‌های فعال — برای dropdown فرم‌ها و فیلتر. فروشنده هم می‌بیند. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customer-categories/active')
  activeCustomerCategories(){
    return this.categories.active();
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('customer-categories')
  createCustomerCategory(
    @Body() dto: CreateCustomerCategoryDto,
  ){
    return this.categories.create(dto);
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch('customer-categories/:id')
  updateCustomerCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerCategoryDto,
  ){
    return this.categories.update(id, dto);
  }


  /** غیرفعال‌سازی — مشتری‌ها دست نمی‌خورند، فقط از انتخاب‌های جدید می‌افتد. */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('customer-categories/:id')
  deactivateCustomerCategory(
    @Param('id') id: string,
  ){
    return this.categories.deactivate(id);
  }


  // ---------- حساب باز و مطالبات ----------

  /**
   * همه‌ی مشتریانِ دارای حساب باز.
   *
   * هم دکمه‌ی «حساب باز» در صندوق از این می‌خورد، هم گزارش مطالبات — یک فرمول،
   * یک عدد.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('debtors')
  debtors(
    @Query('q') q?: string,
    @Query('onlyOverdue') onlyOverdue?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ){
    return this.ledger.debtors({
      q,
      onlyOverdue: onlyOverdue === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }


  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('receivables/summary')
  receivablesSummary(){
    return this.ledger.receivablesSummary();
  }


  /** اعلان‌ها — بدهی معوق و چکِ نزدیکِ سررسید. */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('alerts')
  alerts(){
    return this.ledger.alerts();
  }


  // ---------- حساب مشتری ----------

  /**
   * صورتحساب مشتری — گردش با مانده‌ی متحرک + خلاصه‌ی بازه (اول/جمع‌ها/پایان دوره).
   * format=excel فایل xlsx با سرستون‌های فارسی می‌دهد.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers/:id/statement')
  async statement(
    @Param('id') id: string,
    @Query() q: { startDate?: string; endDate?: string; page?: number; limit?: number; format?: string },
    @Res({ passthrough: true }) res: Response,
  ){
    const r = await this.ledger.statement(id, {
      startDate: q.startDate,
      endDate: q.endDate,
      page: q.page ? Number(q.page) : 1,
      limit: q.format === 'excel' ? 10_000 : q.limit ? Number(q.limit) : 50,
    });
    if (q.format === 'excel') return statementToExcel(res, r.rows.data);
    return r;
  }


  /**
   * بررسی اعتبار پیش از ثبت فروش حساب‌باز.
   *
   * فروشنده صدایش می‌زند تا هشدار را *قبل* از ثبت ببیند. عبور از سقف جلوی
   * فروش را نمی‌گیرد، فقط عدد را نشان می‌دهد.
   */
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('customers/:id/credit-check')
  creditCheck(
    @Param('id') id: string,
    @Query('amount') amount?: string,
  ){
    return this.ledger.creditCheck(id, amount ? Number(amount) : 0);
  }


  /**
   * مانده‌ی اول دوره — بدهیِ مشتری از پیش از نرم‌افزار.
   * فقط مدیر، و فقط یک بار برای هر مشتری.
   */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('customers/:id/opening-balance')
  openingBalance(
    @Param('id') id: string,
    @Body() dto: OpeningBalanceDto,
    @Req() req: any,
  ){
    return this.ledger.setOpeningBalance(
      id,
      dto.amount,
      req.user?.userId,
      dto.note,
    );
  }


  /**
   * اصلاح دستی حساب — با دلیل اجباری.
   * ردیف قبلی هیچ‌وقت پاک نمی‌شود؛ این یک ردیف معکوس اضافه می‌کند.
   */
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('customers/:id/adjust')
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustBalanceDto,
    @Req() req: any,
  ){
    return this.ledger.adjust(id, dto.amount, dto.reason, req.user?.userId);
  }
}
