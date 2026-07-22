import { Controller, Get, Post, Body } from '@nestjs/common';
import { VehicleModelsService } from './vehicle-models.service';

@Controller('vehicle-models')
export class VehicleModelsController {


  constructor(
    private service: VehicleModelsService
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
