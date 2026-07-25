import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationLevel } from '@prisma/client';

@Injectable()
export class LocationTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.locationType.findMany({ orderBy: { level: 'asc' } });
  }

  create(data: { name: string; level: LocationLevel }) {
    return this.prisma.locationType.create({ data });
  }
}
