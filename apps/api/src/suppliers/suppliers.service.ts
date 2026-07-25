import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: any) {
    return this.prisma.supplier.create({
      data: { name: dto.name, phone: dto.phone, address: dto.address },
    });
  }
}
