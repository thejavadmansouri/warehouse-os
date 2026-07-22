import { Controller, Post, Body } from '@nestjs/common';
import { BarcodeService } from './barcode.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

@Controller('barcode')
export class BarcodeController {

  constructor(
    private barcodeService: BarcodeService,
    private inventoryOperationService: InventoryOperationService
  ) {}



  @Post('scan')
  async scan(
    @Body() dto:any
  ){

    return this.barcodeService.scan(dto);

  }

}
