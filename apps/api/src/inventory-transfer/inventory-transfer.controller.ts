import { Controller, Post, Body, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { InventoryTransferService } from './inventory-transfer.service';

@Controller('inventory-transfer')
export class InventoryTransferController {

  constructor(private service: InventoryTransferService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Post()
  transfer(@Body() body: any, @Req() req: any) {
    return this.service.transfer(
      body.productId,
      body.fromLocationId,
      body.toLocationId,
      body.quantity,
      req.user?.userId,
    );
  }
}
