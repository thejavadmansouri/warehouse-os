import { Controller, Post, Body } from '@nestjs/common';
import { LocationBuilderService } from './location-builder.service';
import { GenerateLocationTreeDto } from './dto/generate-location-tree.dto';

@Controller('location-builder')
export class LocationBuilderController {
  constructor(private readonly service: LocationBuilderService) {}

  @Post('generate')
  generate(@Body() dto: GenerateLocationTreeDto) {
    return this.service.generateTree(dto);
  }
}
