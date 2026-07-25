import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BrandsService {

  constructor(
    private prisma: PrismaService
  ){}

  findAll(){
    return this.prisma.brand.findMany();
  }


  create(dto:any){

    return this.prisma.brand.create({
      data:{
        name:dto.name
      }
    });

  }


  update(id:string, dto:any){

    return this.prisma.brand.update({
      where:{ id },
      data:{ name:dto.name }
    });

  }


  remove(id:string){

    return this.prisma.brand.delete({
      where:{ id }
    });

  }

}
