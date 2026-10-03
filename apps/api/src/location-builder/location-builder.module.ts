import { Module } from '@nestjs/common';
import { LocationBuilderController } from './location-builder.controller';
import { LocationBuilderService } from './location-builder.service';

@Module({
  controllers: [LocationBuilderController],
  providers: [LocationBuilderService],
})
export class LocationBuilderModule {}
