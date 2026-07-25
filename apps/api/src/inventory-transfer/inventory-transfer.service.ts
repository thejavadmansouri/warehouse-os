import { Injectable } from '@nestjs/common';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

@Injectable()
export class InventoryTransferService {

  constructor(private inventoryOperation: InventoryOperationService) {}

  async transfer(
    productId: string,
    fromLocationId: string,
    toLocationId: string,
    quantity: number,
    userId?: string,
  ) {
    return this.inventoryOperation.execute({
      type: 'TRANSFER',
      productId,
      locationId: fromLocationId,
      toLocationId,
      quantity,
      source: 'MANUAL_TRANSFER',
      userId,
    });
  }
}
