import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}


  async onModuleInit() {

    const adminExists = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });


    if (!adminExists) {

      const hashedPassword = await argon2.hash('123456');

      await this.prisma.user.create({

        data: {
          username: 'admin',
          password: hashedPassword,
          fullName: 'مدیر کل سیستم',
          role: 'ADMIN',
        },

      });


      console.log(
        '✅ ادمین پیش‌فرض ساخته شد: admin / 123456'
      );

    }

  }



  async login(
    username: string,
    pass: string
  ) {


    const user = await this.prisma.user.findUnique({

      where: {
        username,
      },

    });



    if (!user) {

      throw new UnauthorizedException(
        'نام کاربری یا رمز عبور اشتباه است.'
      );

    }



    let isMatch = false;



    // Argon2
    if (user.password.startsWith('$argon2')) {

      isMatch = await argon2.verify(
        user.password,
        pass
      );

    }



    // Migration از bcrypt قدیمی
    else if (user.password.startsWith('$2')) {

      const bcrypt = require('bcrypt');

      isMatch = await bcrypt.compare(
        pass,
        user.password
      );


      // تبدیل به Argon2 بعد از ورود موفق
      if (isMatch) {

        const newHash = await argon2.hash(pass);

        await this.prisma.user.update({

          where:{
            id:user.id,
          },

          data:{
            password:newHash,
          },

        });

      }

    }



    if (!isMatch) {

      throw new UnauthorizedException(
        'نام کاربری یا رمز عبور اشتباه است.'
      );

    }



    const payload = {

      sub:user.id,
      username:user.username,
      role:user.role,

    };



    return {

      access_token:
        await this.jwtService.signAsync(payload),


      user: {

        id:user.id,
        username:user.username,
        fullName:user.fullName,
        role:user.role,

      },

    };

  }

}