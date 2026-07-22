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

}
