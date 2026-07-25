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



  @Post()
  create(
    @Body() dto:CreatePartCatalogDto
  ){

    return this.service.create(dto);

  }





  @Get()
  findAll(){

    return this.service.findAll();

  }





  @Get('search')
  search(
    @Query('q') q:string
  ){

    return this.service.search(q);

  }





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





  @Delete(':id')
  remove(
    @Param('id') id:string
  ){

    return this.service.remove(id);

  }


}
