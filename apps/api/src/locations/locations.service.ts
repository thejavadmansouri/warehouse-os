import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BarcodeService } from '../barcode/barcode.service';

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


    const barcode =
      dto.barcode ||
      await this.barcodeService.generateLocationBarcode();



    return this.prisma.location.create({

      data:{

        name:dto.name,

        typeId:dto.typeId,

        barcode,


        parentId:
          dto.parentId || null,

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
