import { Controller, Get, Post, Body, UseGuards, Patch, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  ChangePasswordDto,
  ChangeRoleDto,
  CreateUserDto,
} from './dto/user.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';


@Controller('users')
export class UsersController {


  constructor(
    private service:UsersService
  ){}



  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll(){

    return this.service.findAll();

  }



  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(
    @Body() body: CreateUserDto,
  ) {
    return this.service.create({
      username: body.username,
      password: body.password,
      fullName: body.fullName,
      role: body.role,
    });
  }



  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/role')
  changeRole(
    @Param('id') id: string,
    @Body() body: ChangeRoleDto,
  ) {
    return this.service.changeRole(id, body.role);
  }



  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/password')
  changePassword(
    @Param('id') id: string,
    @Body() body: ChangePasswordDto,
  ) {
    return this.service.changePassword(id, body.password);
  }


}
