import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {

  constructor(
    private prisma: PrismaService
  ) {}


  async findAll(){

    return this.prisma.user.findMany({

      select:{
        id:true,
        username:true,
        fullName:true,
        role:true,
        createdAt:true
      },

      orderBy:{
        createdAt:'desc'
      }

    });

  }



  async create(dto:{
    username:string;
    password:string;
    fullName:string;
    role?:Role;
  }){


    const hash =
      await argon2.hash(dto.password);


    return this.prisma.user.create({

      data:{
        username:dto.username,
        password:hash,
        fullName:dto.fullName,
        role:dto.role ?? Role.STAFF
      },

      select:{
        id:true,
        username:true,
        fullName:true,
        role:true
      }

    });

  }



  async changeRole(
    id:string,
    role:Role
  ){

    return this.prisma.user.update({

      where:{
        id
      },

      data:{
        role
      },

      select:{
        id:true,
        username:true,
        fullName:true,
        role:true
      }

    });

  }



  async changePassword(
    id:string,
    password:string
  ){

    const hash =
      await argon2.hash(password);


    return this.prisma.user.update({

      where:{
        id
      },

      data:{
        password:hash
      },

      select:{
        id:true,
        username:true,
        fullName:true
      }

    });

  }

}
