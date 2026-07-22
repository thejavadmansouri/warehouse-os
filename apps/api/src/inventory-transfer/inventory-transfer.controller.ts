import { Controller, Post, Body } from '@nestjs/common';
import { InventoryTransferService } from './inventory-transfer.service';


@Controller('inventory-transfer')
export class InventoryTransferController {


  constructor(
    private service: InventoryTransferService
  ){}


  @Post()
  transfer(
    @Body() body:any
  ){

    return this.service.transfer(
      body.productId,
      body.fromLocationId,
      body.toLocationId,
      body.quantity
    );

  }


}
