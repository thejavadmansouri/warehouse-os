import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehicleModelsService {

  constructor(
    private prisma: PrismaService
  ) {}


  findAll(){

    return this.prisma.vehicleModel.findMany({
      orderBy:{
        name:'asc'
      }
    });

  }


  create(dto:any){

    return this.prisma.vehicleModel.create({

      data:{
        name:dto.name,
        startYear:dto.startYear,
        endYear:dto.endYear,
        systemType:dto.systemType
      }

    });

  }


  update(id:string, dto:any){

    return this.prisma.vehicleModel.update({
      where:{ id },
      data:{
        name:dto.name,
        startYear:dto.startYear,
        endYear:dto.endYear,
        systemType:dto.systemType
      }
    });

  }


  remove(id:string){

    return this.prisma.vehicleModel.delete({
      where:{ id }
    });

  }

}
