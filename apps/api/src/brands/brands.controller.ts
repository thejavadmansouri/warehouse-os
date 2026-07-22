import { Controller, Get, Post, Body } from '@nestjs/common';
import { BrandsService } from './brands.service';


@Controller('brands')
export class BrandsController {


constructor(
 private service:BrandsService
){}



@Get()
findAll(){

 return this.service.findAll();

}



@Post()
create(
 @Body() dto:any
){

 return this.service.create(dto);

}


}
