import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartCatalogDto } from './dto/create-part-catalog.dto';


@Injectable()
export class PartCatalogService {


  constructor(
    private prisma:PrismaService
  ){}



  create(dto:CreatePartCatalogDto){

    return this.prisma.partCatalog.create({

      data:{
        name:dto.name,
        aliases:dto.aliases ?? [],
        unit:dto.unit ?? "عدد"
      }

    });

  }




  findAll(){

    return this.prisma.partCatalog.findMany({

      where:{
        isActive:true
      },

      orderBy:{
        name:'asc'
      }

    });

  }





  async findOne(id:string){

    const item =
      await this.prisma.partCatalog.findUnique({

        where:{
          id
        }

      });


    if(!item){

      throw new NotFoundException(
        "Part catalog not found"
      );

    }


    return item;

  }





  search(q:string){


    return this.prisma.partCatalog.findMany({

      where:{

        isActive:true,

        OR:[

          {
            name:{
              contains:q
            }
          },

          {
            aliases:{
              has:q
            }
          }

        ]

      }

    });

  }





  update(
    id:string,
    dto:CreatePartCatalogDto
  ){


    return this.prisma.partCatalog.update({

      where:{
        id
      },

      data:{

        name:dto.name,

        aliases:dto.aliases,

        unit:dto.unit

      }

    });

  }





  remove(id:string){


    return this.prisma.partCatalog.update({

      where:{
        id
      },

      data:{

        isActive:false

      }

    });

  }


}
