import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canManageSite: true,
        createdAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(dto: {
    username: string;
    password: string;
    fullName: string;
    role?: Role;
    canManageSite?: boolean;
  }) {
    const hash = await argon2.hash(dto.password);
    const role = dto.role ?? Role.STAFF;

    return this.prisma.user.create({
      data: {
        username: dto.username,
        password: hash,
        fullName: dto.fullName,
        role,
        // پیش‌فرضِ مدیران در صورتِ نداشتنِ صراحت. پرچم مستقل است و بعداً از
        // صفحه‌ی کاربران هر شکلی می‌خواهیم درمی‌آید.
        canManageSite:
          dto.canManageSite ?? (role === Role.ADMIN || role === Role.MANAGER),
      },

      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canManageSite: true,
      },
    });
  }

  async changeRole(id: string, role: Role) {
    // ارتقا به مدیر، دسترسیِ سایت را خودکار روشن می‌کند؛ برعکسِ آن (تنزل)
    // پرچم را دست نمی‌زند تا یک انتخابِ صریحِ مدیر از بین نرود.
    const canManageSite = (
      await this.prisma.user.findUnique({
        where: { id },
        select: { canManageSite: true },
      })
    )?.canManageSite;

    return this.prisma.user.update({
      where: {
        id,
      },

      data: {
        role,
        canManageSite:
          canManageSite || role === Role.ADMIN || role === Role.MANAGER,
      },

      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canManageSite: true,
      },
    });
  }

  async setSiteAccess(id: string, canManageSite: boolean) {
    return this.prisma.user.update({
      where: {
        id,
      },

      data: {
        canManageSite,
      },

      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canManageSite: true,
      },
    });
  }

  async changePassword(id: string, password: string) {
    const hash = await argon2.hash(password);

    return this.prisma.user.update({
      where: {
        id,
      },

      data: {
        password: hash,
      },

      select: {
        id: true,
        username: true,
        fullName: true,
      },
    });
  }
}
