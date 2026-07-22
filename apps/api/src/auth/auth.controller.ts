import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';


@Controller('auth')
export class AuthController {

  constructor(
    private authService: AuthService
  ) {}


  @Post('login')
  async login(
    @Body() body:{
      username:string;
      password:string;
    }
  ){

    return this.authService.login(
      body.username,
      body.password
    );

  }



  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(
    @CurrentUser() user:any
  ){

    return user;

  }

}