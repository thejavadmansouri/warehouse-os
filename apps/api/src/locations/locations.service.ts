import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BarcodeService } from '../barcode/barcode.service';
import { randomUUID } from 'crypto';

@Injectable()
export class LocationsService {

  constructor(
    private prisma: PrismaService,
    private barcodeService: BarcodeService,
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

  // خلاصه‌ی زیردرخت برای دیالوگ تأیید در UI (چند فرزند دارد، سابقه دارد یا نه).
  async getSubtreeStats(id: string) {
    const node = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!node) throw new NotFoundException('موقعیت پیدا نشد');

    const levels = await this.collectSubtreeLevels(id);
    const allIds = levels.flat();
    const descendantCount = allIds.length - 1;
    const hasHistory = await this.subtreeHasHistory(allIds);

    return {
      id: node.id,
      name: node.name,
      descendantCount,
      totalCount: allIds.length,
      hasHistory,
      willDeactivate: hasHistory,
    };
  }

  // حذف یک موقعیت به‌همراه کل زیردرختش.
  async remove(id: string) {
    const node = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!node) throw new NotFoundException('موقعیت پیدا نشد');

    const levels = await this.collectSubtreeLevels(id);
    const allIds = levels.flat();
    const hasHistory = await this.subtreeHasHistory(allIds);

    if (hasHistory) {
      // فقط غیرفعال — کد/بارکد/path و سابقه دست‌نخورده می‌مانند.
      await this.prisma.location.updateMany({
        where: { id: { in: allIds } },
        data: { isActive: false, deletedAt: new Date() },
      });
      return {
        mode: 'deactivated' as const,
        affected: allIds.length,
        message: `«${node.name}» و ${allIds.length - 1} زیرمجموعه غیرفعال شدند (سابقه‌ی موجودی داشتند).`,
      };
    }

    // خالی و بی‌سابقه → حذف واقعی، از عمیق‌ترین سطح به بالا (رعایت FK).
    await this.prisma.$transaction(async (tx) => {
      for (let i = levels.length - 1; i >= 0; i--) {
        await tx.location.deleteMany({ where: { id: { in: levels[i] } } });
      }
    });
    return {
      mode: 'deleted' as const,
      affected: allIds.length,
      message: `«${node.name}» و ${allIds.length - 1} زیرمجموعه حذف شدند.`,
    };
  }

  // حذف گروهی: هر موقعیت با زیردرختش طبق همان قانون بالا پردازش می‌شود.
  // موقعیت‌هایی که خودشان زیرمجموعه‌ی یک انتخاب دیگرند نادیده گرفته می‌شوند
  // (والدشان قبلاً آن‌ها را پوشش می‌دهد).
  async bulkRemove(ids: string[]) {
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
      const res = await this.remove(id);
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
