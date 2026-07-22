import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, createdAt: true },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() body: { username: string; pass: string; fullName: string; role: Role }) {
    const hashedPassword = await bcrypt.hash(body.pass, 10);
    
    return this.prisma.user.create({
      data: {
        username: body.username,
        password: hashedPassword,
        fullName: body.fullName,
        role: body.role || Role.STAFF,
      },
      select: { id: true, username: true, fullName: true, role: true },
    });
  }
}
