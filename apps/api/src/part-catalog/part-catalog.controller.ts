import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';

import { PartCatalogService } from './part-catalog.service';
import { CreatePartCatalogDto } from './dto/create-part-catalog.dto';


@Controller('part-catalog')
export class PartCatalogController {


  constructor(
    private service:PartCatalogService
  ){}



  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(
    @Body() dto:CreatePartCatalogDto
  ){

    return this.service.create(dto);

  }





  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  @Get()
  findAll(){

    return this.service.findAll();

  }





  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.SALES)
  @Get('search')
  search(
    @Query('q') q:string
  ){

    return this.service.search(q);

  }





  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(
    @Param('id') id:string,
    @Body() dto:CreatePartCatalogDto
  ){

    return this.service.update(
      id,
      dto
    );

  }





  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  remove(
    @Param('id') id:string
  ){

    return this.service.remove(id);

  }


}
