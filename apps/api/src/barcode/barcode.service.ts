import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

@Injectable()
export class BarcodeService {

  constructor(
    private prisma: PrismaService,
    private inventoryOperation: InventoryOperationService
  ) {}



  async generateProductBarcode(): Promise<string> {

    const count = await this.prisma.product.count();

    const number = String(count + 1).padStart(9, '0');

    return `WOS${number}`;
  }



  async generateLocationBarcode(): Promise<string> {

    const count = await this.prisma.location.count();

    const number = String(count + 1).padStart(6, '0');

    return `LOC${number}`;
  }



  async scan(dto:any){

    const product =
      await this.prisma.product.findFirst({

        where:{
          OR:[
            {
              internalBarcode:dto.barcode
            },
            {
              factoryBarcode:dto.barcode
            }
          ]
        }

      });



    if(!product){
      throw new Error('کالا پیدا نشد');
    }



    const location =
      await this.prisma.location.findUnique({

        where:{
          barcode:dto.locationBarcode
        }

      });



    if(!location){
      throw new Error('موقعیت پیدا نشد');
    }




    let toLocationId = null;


    if(dto.action === 'TRANSFER'){

      if(!dto.toLocationBarcode){

        throw new Error('مقصد انتقال مشخص نیست');

      }


      const toLocation =
        await this.prisma.location.findUnique({

          where:{
            barcode:dto.toLocationBarcode
          }

        });


      if(!toLocation){

        throw new Error('موقعیت مقصد پیدا نشد');

      }


      toLocationId = toLocation.id;

    }



    return this.inventoryOperation.execute({

      type:dto.action,

      productId:product.id,

      locationId:location.id,

      toLocationId,

      quantity:dto.quantity,

      note:'Barcode scan',

      source:'BARCODE'

    });
  }

}
