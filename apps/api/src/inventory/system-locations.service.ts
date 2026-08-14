import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';


/**
 * مکان‌های **سیستمی** — قفسه‌هایی که در انبار فیزیکی وجود ندارند ولی هر حرکت
 * موجودی به یک مکان نیاز دارد.
 *
 * دو تا داریم و هر دو یک ریشه دارند: لحظه‌ای که آدم پشت پیشخوان یا حسابدار
 * پشت میز، جای واقعی جنس را **نمی‌داند**، و متوقف‌کردن کار به‌خاطر این ندانستن
 * از خودِ عددِ نادقیق بدتر است.
 *
 * - «موجودی ثبت‌نشده» — فروشِ کالایی که هنوز وارد نرم‌افزار نشده. موجودیِ منفیِ
 *   اینجا یعنی «این تعداد فروخته شد پیش از آنکه ثبت شود».
 * - «انبار موقت» — ورودِ کالا از فاکتور خرید وقتی حسابدار قفسه را نمی‌داند.
 *   موجودیِ مثبتِ اینجا یعنی صفِ کارِ چیدن: کارگر باید ببرد سر جایش.
 *
 * هر دو عمداً در سطح ریشه و زیر یک `LocationType` مخصوص در **عمق ۹۹** ساخته
 * می‌شوند تا در درخت انبار قاطیِ قفسه‌های واقعی نشوند و با قید یکتاییِ
 * `[warehouseId, depth]` انواعِ واقعی تداخل نکنند.
 */
@Injectable()
export class SystemLocationsService {

  private static readonly TYPE_NAME = 'سیستمی';
  private static readonly TYPE_DEPTH = 99;

  private static readonly UNREGISTERED_NAME = 'موجودی ثبت‌نشده';
  private static readonly UNREGISTERED_PREFIX = 'SYS-UNREG-';

  private static readonly STAGING_NAME = 'انبار موقت';
  private static readonly STAGING_PREFIX = 'SYS-STAGE-';


  /** مکانِ فروشِ کالای هنوز ثبت‌نشده. در اولین استفاده ساخته می‌شود. */
  unregisteredStock(tx: Prisma.TransactionClient, warehouseId: string): Promise<string> {
    return this.ensure(
      tx,
      warehouseId,
      SystemLocationsService.UNREGISTERED_PREFIX,
      SystemLocationsService.UNREGISTERED_NAME,
    );
  }


  /** مکانِ ورودِ کالای بدون قفسه‌ی مشخص. در اولین استفاده ساخته می‌شود. */
  staging(tx: Prisma.TransactionClient, warehouseId: string): Promise<string> {
    return this.ensure(
      tx,
      warehouseId,
      SystemLocationsService.STAGING_PREFIX,
      SystemLocationsService.STAGING_NAME,
    );
  }


  private async ensure(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    prefix: string,
    name: string,
  ): Promise<string> {

    const code = `${prefix}${warehouseId.slice(0, 8)}`;

    /*
     * `code` در کل دیتابیس یکتاست، ولی مالکیتِ انبار هم بررسی می‌شود: دو انبار
     * با هشت کاراکترِ اولِ یکسان در uuid تقریباً محال است، و اگر بشود نباید
     * بی‌صدا مکانِ انبار دیگری برگردد.
     */
    const existing = await tx.location.findUnique({
      where:{ code },
      select:{ id:true, warehouseId:true },
    });
    if (existing) {
      if (existing.warehouseId !== warehouseId) {
        throw new NotFoundException({
          error:'SYSTEM_LOCATION_CONFLICT',
          code,
          message:'کد مکان سیستمی با انبار دیگری تداخل دارد',
        });
      }
      return existing.id;
    }

    const warehouse = await tx.warehouse.findUnique({
      where:{ id: warehouseId },
      select:{ code:true },
    });
    if (!warehouse) {
      throw new NotFoundException({
        error:'WAREHOUSE_NOT_FOUND',
        message:'انبار پیدا نشد',
      });
    }

    const type = await tx.locationType.upsert({
      where:{
        warehouseId_depth:{
          warehouseId,
          depth: SystemLocationsService.TYPE_DEPTH,
        },
      },
      create:{
        warehouseId,
        name: SystemLocationsService.TYPE_NAME,
        depth: SystemLocationsService.TYPE_DEPTH,
      },
      update:{},
    });

    const created = await tx.location.create({
      data:{
        name,
        code,
        barcode: `LOC-${code}`,
        path: `${warehouse.code} > ${name}`,
        depth: SystemLocationsService.TYPE_DEPTH,
        warehouseId,
        typeId: type.id,
      },
      select:{ id:true },
    });

    return created.id;
  }
}
