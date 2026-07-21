import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryLogDto } from './dto/create-inventory-log.dto';
import { VoiceEntryDto } from './dto/voice-entry.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('by-location')
  findByLocation(@Query('locationId') locationId: string) {
    return this.service.findByLocation(locationId);
  }

  @Post()
  create(@Body() dto: CreateInventoryLogDto) {
    return this.service.create(dto);
  }

  @Post('voice-entry')
  voiceEntry(@Body() dto: VoiceEntryDto) {
    return this.service.voiceEntry(dto);
  }
}
