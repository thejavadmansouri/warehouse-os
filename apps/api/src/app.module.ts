import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TokenRefreshInterceptor } from './auth/token-refresh.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesGuard } from './auth/roles.guard';
import { BarcodeModule } from './barcode/barcode.module';
import { ProductsModule } from './products/products.module';
import { LocationBuilderModule } from './location-builder/location-builder.module';
import { LocationsModule } from './locations/locations.module';
import { LocationTypesModule } from './location-types/location-types.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { InventoryModule } from './inventory/inventory.module';
import { VehicleModelsModule } from './vehicle-models/vehicle-models.module';
import { BrandsModule } from './brands/brands.module';
import { InventorySessionModule } from './inventory-session/inventory-session.module';
import { InventoryTransferModule } from './inventory-transfer/inventory-transfer.module';
import { InventoryOperationModule } from './inventory-operation/inventory-operation.module';
import { UploadsModule } from './uploads/uploads.module';
import { InventoryCountModule } from './inventory-count/inventory-count.module';
import { MobileModule } from './mobile/mobile.module';
import { PartCatalogModule } from './part-catalog/part-catalog.module';
import { ImportsModule } from './imports/imports.module';
import { CategoriesModule } from './categories/categories.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { LabelsModule } from './labels/labels.module';
import { PrintJobsModule } from './print-jobs/print-jobs.module';
import { PendingOperationsModule } from './pending-operations/pending-operations.module';
import { ProductRequestsModule } from './product-requests/product-requests.module';
import { SalesModule } from './sales/sales.module';
import { PurchasesModule } from './purchases/purchases.module';
import { WorkTasksModule } from './work-tasks/work-tasks.module';
import { ReportsModule } from './reports/reports.module';
import { BackupsModule } from './backups/backups.module';

import { ShopModule } from './shop/shop.module';
import { StorefrontModule } from './storefront/storefront.module';
import { OnlineOrdersModule } from './storefront/online-orders.module';
import { SiteAdminModule } from './site-admin/site-admin.module';
import { SyncModule } from './sync/sync.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ShortagesModule } from './shortages/shortages.module';
import { SmsModule } from './sms/sms.module';

/*
 * ماژول‌هایی که **فقط روی سرور انبار** لود می‌شوند.
 *
 * ⚠️ این فهرست خط دفاعِ اصلیِ سرورِ اینترنتی است. سایت روی VPS اجرا می‌شود و
 * یک لاگینِ مدیر روی اینترنت دارد؛ اگر این ماژول‌ها آنجا هم لود شوند، بیش از
 * ۲۰۰ endpointِ انبار — از `/users` و `/backups` تا `/reports` و `/locations` —
 * روی اینترنت مونت می‌شوند و فقط یک توکن از آن‌ها فاصله دارند.
 *
 * قاعده: هر ماژولِ تازه‌ای که به انبار مربوط است اینجا می‌آید، نه در فهرست
 * مشترک. اگر شک داری، اینجا بگذارش.
 */
const WAREHOUSE_ONLY = [
  UsersModule,
  BarcodeModule,
  ProductsModule,
  LocationsModule,
  LocationTypesModule,
  WarehousesModule,
  LocationBuilderModule,
  InventoryModule,
  VehicleModelsModule,
  BrandsModule,
  InventorySessionModule,
  InventoryTransferModule,
  InventoryOperationModule,
  UploadsModule,
  InventoryCountModule,
  MobileModule,
  PartCatalogModule,
  ImportsModule,
  CategoriesModule,
  SuppliersModule,
  LabelsModule,
  PrintJobsModule,
  PendingOperationsModule,
  ProductRequestsModule,
  SalesModule,
  PurchasesModule,
  WorkTasksModule,
  ReportsModule,
  BackupsModule,
  ShortagesModule,
  ShopModule,
  OnlineOrdersModule,
];

/**
 * ماژول‌های مشترک — روی هر دو ماشین لازم‌اند.
 *
 * `AuthModule` عمداً اینجاست: پنلِ سایت هم لاگین می‌خواهد. امنیتش از جدا بودنِ
 * **دیتابیس** می‌آید نه از جدا بودنِ کد — روی VPS جدولِ `User` فقط مدیرِ سایت
 * را دارد و رمزِ هیچ کارمندِ انباری آنجا نیست.
 */
const SHARED = [PrismaModule, AuthModule, StorefrontModule];

function rolePart() {
  const role = (process.env.APP_ROLE ?? 'warehouse').trim().toLowerCase();
  // پیش‌فرض «انبار» است تا نصب‌های موجود با به‌روزرسانی چیزی از دست ندهند.
  return role === 'site' ? [SiteAdminModule] : WAREHOUSE_ONLY;
}

@Module({
  imports: [
    RealtimeModule,
    ...SHARED,
    ...rolePart(),
    // نیمه‌ی مربوط به این ماشین را لود می‌کند؛ بدون SYNC_ROLE هیچ‌کدام.
    SyncModule.forRole(),
    ScheduleModule.forRoot(),
    /*
     * محدودیت نرخ — فقط روی مسیر لاگین اعمال می‌شود (با @UseGuards و @Throttle
     * روی خودِ endpoint). پیش‌فرضِ ماژول یک fallbackِ سخاوتمندانه است و هیچ
     * مسیر دیگری را تحت فشار نمی‌گذارد؛ POSِ شلوغ نباید throttled شود.
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    /*
     * فقط عکس‌های محصول عمومی سرو می‌شوند؛ عکس‌های انبار (inventory-photos و
     * inventory-logs) از اینجا حذف شدند و فقط از طریق endpoint احرازشده‌ی
     * GET /uploads/photo/:assetId (گیت‌دارِ MANAGER/ADMIN) در دسترس‌اند —
     * همان بایت‌ها نباید بدون توکن در دسترس باشند. rootPath روی زیرپوشه‌ی
     * products است تا URLهای ذخیره‌شده در دیتابیس ( /storage/products/... )
     * دست‌نخورده بمانند.
     */
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'storage', 'products'),
      serveRoot: '/storage/products',
    }),
  ],
  controllers: [
    AppController,
  ],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Sliding session: re-issues a fresh token (same sid) past its half-life
    // via the X-Refreshed-Token header so the worker app never has to re-login.
    {
      provide: APP_INTERCEPTOR,
      useClass: TokenRefreshInterceptor,
    },
  ],
})
export class AppModule {}
