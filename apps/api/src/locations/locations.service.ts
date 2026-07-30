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


    let parent:{ id:string; path:string; warehouseId:string|null } | null = null;

    if(dto.parentId){

      parent = await this.prisma.location.findUnique({
        where:{ id: dto.parentId },
        select:{ id:true, path:true, warehouseId:true },
      });

      if(!parent){
        throw new NotFoundException('موقعیت والد پیدا نشد');
      }

    }


    if(dto.warehouseId && dto.warehouseId !== type.warehouseId){
      throw new BadRequestException('نوع موقعیت انتخاب‌شده متعلق به این انبار نیست');
    }

    const warehouseId = type.warehouseId;


    const barcode =
      dto.barcode ||
      await this.barcodeService.generateLocationBarcode();


    // 'code' یک فیلد اجباری و یکتاست؛ اگر کاربر خودش نداده، از همون بارکد
    // (که خودش یکتاست) به‌عنوان کد هم استفاده می‌کنیم.
    const code =
      dto.code || barcode;


    const id = randomUUID();

    // path به همون شکل materialized-path که LocationBuilder می‌سازه: <parentPath><id>/
    const path = `${parent?.path ?? ''}${id}/`;


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





  async findChildren(parentId:string|null){

    return this.prisma.location.findMany({

      where:{
        parentId
      },

      include:{
        children:true
      }

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

}
