import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BarcodeService } from '../barcode/barcode.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';
import { randomUUID } from 'crypto';

/**
 * تصمیمِ تکلیفِ موجودی هنگام حذفِ قفسه.
 * `transfer` → به `destinationLocationId` منتقل کن؛ `writeoff` → با `reason` صفر کن.
 */
export interface RemoveLocationOptions {
  stockAction?: 'transfer' | 'writeoff';
  destinationLocationId?: string;
  reason?: string;
}

@Injectable()
export class LocationsService {

  constructor(
    private prisma: PrismaService,
    private barcodeService: BarcodeService,
    private operation: InventoryOperationService,
  ) {}



  async findAll() {

    return this.prisma.location.findMany({

      include:{
        type:true,
        children:true,
        parent:true,
      },

      orderBy:{
        createdAt:'desc'
      }

    });

  }




  async create(dto:any) {

    const type = await this.prisma.locationType.findUnique({
      where:{ id: dto.typeId },
    });

    if(!type){
      throw new NotFoundException('نوع موقعیت پیدا نشد');
    }


    let parent:{ id:string; path:string; code:string; warehouseId:string|null } | null = null;

    if(dto.parentId){

      parent = await this.prisma.location.findUnique({
        where:{ id: dto.parentId },
        select:{ id:true, path:true, code:true, warehouseId:true },
      });

      if(!parent){
        throw new NotFoundException('موقعیت والد پیدا نشد');
      }

    }


    if(dto.warehouseId && dto.warehouseId !== type.warehouseId){
      throw new BadRequestException('نوع موقعیت انتخاب‌شده متعلق به این انبار نیست');
    }

    const warehouseId = type.warehouseId;

    // کد و بارکد و path دقیقاً هم‌فرمت با LocationBuilder ساخته می‌شوند تا موقعیت‌های
    // تکی با گروهی روی قفسه یکدست باشند:
    //   code    = <کد والد یا کد انبار>-<برچسب دو رقمی بعدی بین هم‌نیاها>
    //   barcode = LOC-<code>
    //   path    = <path والد یا کد انبار> > <نام>
    const warehouse = warehouseId
      ? await this.prisma.warehouse.findUnique({
          where: { id: warehouseId },
          select: { code: true },
        })
      : null;
    const parentCode = parent?.code ?? warehouse?.code ?? 'WH';
    const parentPath = parent?.path ?? warehouse?.code ?? '';

    const id = randomUUID();

    let code = dto.code?.trim() || '';
    let barcode = dto.barcode?.trim() || '';
    if (!code) {
      // برچسب بعدی: از تعداد هم‌نیاها شروع کن و تا رسیدن به کد آزاد بالا برو.
      // برای ریشه (parentId=null) حتماً به همین انبار محدود می‌کنیم وگرنه ریشه‌ی
      // انبارهای دیگر هم شمرده می‌شوند و شماره‌گذاری از ۰۱ شروع نمی‌شود.
      const siblingCount = await this.prisma.location.count({
        where: dto.parentId
          ? { parentId: dto.parentId }
          : { parentId: null, warehouseId },
      });
      let n = siblingCount + 1;
      do {
        code = `${parentCode}-${String(n).padStart(2, '0')}`;
        n++;
      } while (await this.prisma.location.findUnique({ where: { code } }));
    }
    if (!barcode) {
      barcode = `LOC-${code}`;
    }

    const path = parentPath ? `${parentPath} > ${dto.name}` : dto.name;


    return this.prisma.location.create({

      data:{

        id,

        name:dto.name,

        code,

        typeId:dto.typeId,

        barcode,

        warehouseId,

        parentId:
          dto.parentId || null,

        path,

        depth: type.depth,

      },

      include:{
        type:true,
        parent:true,
      }

    });

  }





  async findOne(id:string){

    return this.prisma.location.findUnique({

      where:{
        id
      },

      include:{
        type:true,
        parent:true,
        children:true,
      }

    });

  }





  async findChildren(parentId:string|null, warehouseId?:string){

    return this.prisma.location.findMany({

      where:{
        parentId,
        isActive: true,
        ...(warehouseId ? { warehouseId } : {}),
      },

      include:{
        type: true,
        // فقط شمارش فرزندان تا UI درخت بداند فلش باز/بسته بگذارد؛ خودِ فرزندان
        // با expand و lazy-load جدا گرفته می‌شوند (پرفورمنس در ۱۰۰k+).
        _count: { select: { children: { where: { isActive: true } } } },
      },

      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],

    });

  }





  async resolveByBarcode(barcode:string){

    return this.prisma.location.findFirst({

      where:{
        barcode
      },

      include:{
        type:true,
        parent:true,
      }

    });

  }





  async getPath(id:string):Promise<string>{

    const location =
      await this.findOne(id);


    if(!location)
      return '';



    if(!location.parent)
      return location.name;



    return `${await this.getPath(location.parent.id)} / ${location.name}`;

  }




  // ---------------------------------------------------------------------------
  // حذف (طبق قانون تغییرناپذیری): زیردرختِ کاملاً خالی و بی‌سابقه واقعاً حذف
  // می‌شود؛ هر زیردرختی که موجودی/لاگ/عملیات‌در‌انتظار/شمارش/... دارد فقط
  // غیرفعال (soft-delete) می‌شود تا کد چاپ‌شده و سابقه‌ی حسابرسی نشکند.
  // ---------------------------------------------------------------------------

  // فرزندان را سطح‌به‌سطح جمع می‌کند (والد قبل از فرزند) تا حذف را بتوان از
  // عمیق‌ترین سطح به بالا انجام داد و قید FK والد↔فرزند نشکند.
  private async collectSubtreeLevels(rootId: string): Promise<string[][]> {
    const levels: string[][] = [[rootId]];
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await this.prisma.location.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      if (children.length === 0) break;
      const ids = children.map((c) => c.id);
      levels.push(ids);
      frontier = ids;
    }
    return levels;
  }

  // آیا این مجموعه موقعیت‌ها سابقه‌ای دارند که نباید حذف فیزیکی شوند؟
  private async subtreeHasHistory(ids: string[]): Promise<boolean> {
    const where = { locationId: { in: ids } };
    const [inv, logs, pending, counts, sessionLocs, printItems, prodReqs] =
      await Promise.all([
        this.prisma.inventory.count({ where }),
        this.prisma.inventoryLog.count({ where }),
        this.prisma.pendingOperation.count({ where }),
        this.prisma.inventoryCount.count({ where }),
        this.prisma.inventorySessionLocation.count({ where }),
        this.prisma.printJobItem.count({ where }),
        this.prisma.productCreationRequest.count({ where }),
      ]);
    return (
      inv + logs + pending + counts + sessionLocs + printItems + prodReqs > 0
    );
  }

  /**
   * موجودیِ زنده‌ی نشسته روی یک زیردرخت.
   *
   * فقط ردیف‌های مثبت مهم‌اند: همین‌هایند که اگر قفسه حذف شود «بی‌صاحب» می‌مانند
   * — روی صفحه‌ی فروش موجود نشان داده می‌شوند ولی سرِ ثبتِ فاکتور رد می‌شوند،
   * چون مکانشان دیگر معتبر نیست. برای همین قبل از حذف باید تکلیفشان روشن شود.
   */
  private async stockOnSubtree(ids: string[]) {
    const rows = await this.prisma.inventory.findMany({
      where: { locationId: { in: ids }, quantity: { gt: 0 } },
      select: { productId: true, locationId: true, quantity: true },
    });
    return {
      rows,
      units: rows.reduce((s, r) => s + r.quantity, 0),
      products: new Set(rows.map((r) => r.productId)).size,
      locations: new Set(rows.map((r) => r.locationId)).size,
    };
  }

  // خلاصه‌ی زیردرخت برای دیالوگ تأیید در UI (چند فرزند دارد، سابقه دارد یا نه،
  // و مهم‌تر: چقدر موجودیِ زنده رویش نشسته که باید قبل از حذف جابه‌جا/تصفیه شود).
  async getSubtreeStats(id: string) {
    const node = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!node) throw new NotFoundException('موقعیت پیدا نشد');

    const levels = await this.collectSubtreeLevels(id);
    const allIds = levels.flat();
    const descendantCount = allIds.length - 1;
    const [hasHistory, stock] = await Promise.all([
      this.subtreeHasHistory(allIds),
      this.stockOnSubtree(allIds),
    ]);

    return {
      id: node.id,
      name: node.name,
      descendantCount,
      totalCount: allIds.length,
      hasHistory,
      willDeactivate: hasHistory,
      // اگر این‌ها صفر نباشند، UI باید اول انتخابِ «انتقال یا تصفیه» را بگیرد.
      stockUnits: stock.units,
      stockProducts: stock.products,
      stockLocations: stock.locations,
      hasStock: stock.units > 0,
    };
  }

  // حذف یک موقعیت به‌همراه کل زیردرختش.
  //
  // اگر موجودیِ زنده روی زیردرخت باشد، حذف بدون تصمیمِ صریح انجام نمی‌شود:
  // یا جنس به یک قفسه‌ی دیگر منتقل می‌شود (`transfer`)، یا تصفیه/صفر می‌شود
  // (`writeoff`). بدون تعیینِ تکلیف، جنس روی قفسه‌ی مرده «بی‌صاحب» می‌ماند و
  // دیگر قابل فروش نیست — دقیقاً باگی که این تغییر جلویش را می‌گیرد.
  async remove(id: string, opts?: RemoveLocationOptions, userId?: string) {
    const node = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true, name: true, warehouseId: true },
    });
    if (!node) throw new NotFoundException('موقعیت پیدا نشد');

    const levels = await this.collectSubtreeLevels(id);
    const allIds = levels.flat();
    const idSet = new Set(allIds);
    const [hasHistory, stock] = await Promise.all([
      this.subtreeHasHistory(allIds),
      this.stockOnSubtree(allIds),
    ]);

    // موجودیِ زنده دارد ولی تکلیفش روشن نشده → به UI بگو انتخاب بگیرد.
    if (stock.units > 0 && !opts?.stockAction) {
      throw new BadRequestException({
        error: 'LOCATION_HAS_STOCK',
        stockUnits: stock.units,
        stockProducts: stock.products,
        stockLocations: stock.locations,
        message: `این موقعیت ${stock.units} عدد موجودی روی ${stock.locations} قفسه دارد؛ اول جابه‌جا یا تصفیه‌اش کن.`,
      });
    }

    // اعتبارسنجیِ انتخاب، پیش از باز کردن تراکنش.
    if (stock.units > 0 && opts?.stockAction === 'transfer') {
      const dest = opts.destinationLocationId;
      if (!dest) {
        throw new BadRequestException({
          error: 'DESTINATION_REQUIRED',
          message: 'برای انتقال، قفسه‌ی مقصد را انتخاب کن.',
        });
      }
      if (idSet.has(dest)) {
        throw new BadRequestException({
          error: 'DESTINATION_INSIDE_SUBTREE',
          message: 'مقصد نمی‌تواند خودِ همین شاخه‌ای باشد که حذف می‌شود.',
        });
      }
      const destLoc = await this.prisma.location.findFirst({
        where: { id: dest, isActive: true, warehouseId: node.warehouseId },
        select: { id: true },
      });
      if (!destLoc) {
        throw new BadRequestException({
          error: 'DESTINATION_NOT_FOUND',
          message: 'قفسه‌ی مقصد پیدا نشد یا در این انبار فعال نیست.',
        });
      }
    }
    if (
      stock.units > 0 &&
      opts?.stockAction === 'writeoff' &&
      !opts.reason?.trim()
    ) {
      throw new BadRequestException({
        error: 'REASON_REQUIRED',
        message: 'برای تصفیه‌ی موجودی، نوشتن دلیل الزامی است.',
      });
    }

    // جابه‌جایی/تصفیه و حذف، همه در یک تراکنش: یا کل کار انجام می‌شود یا هیچ.
    await this.prisma.$transaction(async (tx) => {
      // ۱) خالی کردنِ موجودی طبق تصمیم — از تک‌نقطه‌ی تغییر موجودی (قانون ۱).
      if (stock.units > 0) {
        for (const r of stock.rows) {
          if (opts!.stockAction === 'transfer') {
            await this.operation.execute(
              {
                type: 'TRANSFER',
                productId: r.productId,
                locationId: r.locationId,
                toLocationId: opts!.destinationLocationId,
                quantity: r.quantity,
                source: 'LOCATION_DELETE',
                userId: userId ?? null,
                note: `انتقال به‌خاطر حذف «${node.name}»`,
              },
              tx,
            );
          } else {
            await this.operation.execute(
              {
                type: 'ADJUST',
                productId: r.productId,
                locationId: r.locationId,
                targetQuantity: 0,
                source: 'LOCATION_DELETE',
                userId: userId ?? null,
                note: opts!.reason!.trim(),
              },
              tx,
            );
          }
        }
      }

      // ۲) حذف/غیرفعال‌سازی. سابقه (لاگ/رکورد موجودیِ صفرشده) که بماند فقط
      // غیرفعال می‌شود تا کد/بارکد/path و تاریخچه دست‌نخورده بماند.
      if (hasHistory || stock.units > 0) {
        await tx.location.updateMany({
          where: { id: { in: allIds } },
          data: { isActive: false, deletedAt: new Date() },
        });
      } else {
        // خالی و بی‌سابقه → حذف واقعی، از عمیق‌ترین سطح به بالا (رعایت FK).
        for (let i = levels.length - 1; i >= 0; i--) {
          await tx.location.deleteMany({ where: { id: { in: levels[i] } } });
        }
      }
    });

    const deactivated = hasHistory || stock.units > 0;
    const movedNote =
      stock.units > 0
        ? opts!.stockAction === 'transfer'
          ? ` ${stock.units} عدد موجودی منتقل شد.`
          : ` ${stock.units} عدد موجودی تصفیه شد.`
        : '';

    return {
      mode: deactivated ? ('deactivated' as const) : ('deleted' as const),
      affected: allIds.length,
      movedUnits: stock.units,
      stockAction: opts?.stockAction ?? null,
      message: deactivated
        ? `«${node.name}» و ${allIds.length - 1} زیرمجموعه غیرفعال شدند.${movedNote}`
        : `«${node.name}» و ${allIds.length - 1} زیرمجموعه حذف شدند.`,
    };
  }

  // حذف گروهی: هر موقعیت با زیردرختش طبق همان قانون بالا پردازش می‌شود.
  // موقعیت‌هایی که خودشان زیرمجموعه‌ی یک انتخاب دیگرند نادیده گرفته می‌شوند
  // (والدشان قبلاً آن‌ها را پوشش می‌دهد).
  async bulkRemove(ids: string[], opts?: RemoveLocationOptions, userId?: string) {
    const unique = [...new Set(ids)];
    let deleted = 0;
    let deactivated = 0;
    const done = new Set<string>();

    for (const id of unique) {
      if (done.has(id)) continue;
      const exists = await this.prisma.location.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) continue;
      // همان تصمیمِ موجودی برای همه‌ی موارد انتخاب‌شده اعمال می‌شود؛ اگر یکی
      // موجودی داشته باشد و تصمیمی نیامده باشد، remove خطای LOCATION_HAS_STOCK
      // می‌دهد و UI انتخاب می‌گیرد.
      const res = await this.remove(id, opts, userId);
      if (res.mode === 'deleted') deleted += res.affected;
      else deactivated += res.affected;
      // زیرمجموعه‌های همین گره را از پردازش دوباره کنار بگذار
      const levels = await this.collectSubtreeLevels(id).catch(() => []);
      for (const lvl of levels) for (const x of lvl) done.add(x);
      done.add(id);
    }

    return {
      deletedCount: deleted,
      deactivatedCount: deactivated,
      message: `${deleted} موقعیت حذف و ${deactivated} موقعیت غیرفعال شد.`,
    };
  }

}
