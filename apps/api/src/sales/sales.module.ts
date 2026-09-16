import { Module } from '@nestjs/common';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CustomersService } from './customers.service';
import { CustomerCategoriesService } from './customer-categories.service';
import { ReceiptsService } from './receipts.service';
import { PayoutsService } from './payouts.service';
import { QuotationsService } from './quotations.service';
import { BlankQuotationsService } from './blank-quotations.service';
import { ReturnsService } from './returns.service';
import { CorrectionsService } from './corrections.service';
import { AdjustmentsService } from './adjustments.service';
import { PaymentReversalsService } from './payment-reversals.service';
import { PaymentsRecomposeService } from './payments-recompose.service';
import { LedgerService } from './ledger.service';
import { OpenAccountsService } from './open-accounts.service';
import { InvoiceEffectsService } from './invoice-effects.service';
import { StatementsService } from './statements.service';
import { ChequesService } from './cheques.service';

import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { SystemLocationsService } from '../inventory/system-locations.service';
import { ProductsModule } from '../products/products.module';

@Module({
  // موتور جست‌وجوی محصول برای «پیشنهاد کالا» روی قلم‌های متنی برگه‌ی سفید.
  imports: [ProductsModule],

  controllers: [SalesController],

  providers: [
    PrismaService,
    SalesService,
    CustomersService,
    CustomerCategoriesService,
    ReceiptsService,
    PayoutsService,
    QuotationsService,
    BlankQuotationsService,
    ReturnsService,
    CorrectionsService,
    AdjustmentsService,
    PaymentReversalsService,
    PaymentsRecomposeService,
    LedgerService,
    OpenAccountsService,
    InvoiceEffectsService,
    StatementsService,
    ChequesService,
    InventoryOperationService,
    SystemLocationsService,
  ],

  exports: [
    SalesService,
    CustomersService,
    CustomerCategoriesService,
    ReceiptsService,
    PayoutsService,
    QuotationsService,
    BlankQuotationsService,
    ReturnsService,
    CorrectionsService,
    LedgerService,
    OpenAccountsService,
    InvoiceEffectsService,
    StatementsService,
    ChequesService,
  ],
})
export class SalesModule {}
