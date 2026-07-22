import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extractInventoryFromVoice } from '../lib/voice-parser';
import { InventoryEngineService } from '../inventory-engine/inventory-engine.service';


@Injectable()
export class VoiceInventoryService {


constructor(
  private prisma: PrismaService,
  private inventoryEngine: InventoryEngineService
){}



async process(
  locationBarcode: string,
  text: string,
  sessionId: string
) {


    const location =
      await this.prisma.location.findUnique({
        where:{
          barcode: locationBarcode
        }
      });


    if(!location){

      throw new Error(
        'Location not found'
      );

    }



    const parsed =
      extractInventoryFromVoice(text);



    let brandName: string | undefined = undefined;

    if(parsed.brand){

      const brand =
        await this.prisma.brand.findFirst({
          where:{
            name:{
              contains: brandName,
              mode:'insensitive'
            }
          }
        });

      if(brand){
        brandName = brand.name;
      }

    }


    const product =
      await this.prisma.product.findFirst({

        where:{

          AND:[

            {
              name:{
                contains: parsed.productName,
                mode:'insensitive'
              }
            },


            brandName
            ?
            {
              brand:{
                name:{
                  contains: brandName,
                  mode:'insensitive'
                }
              }
            }
            :
            {},



            parsed.compatibleVehicle
            ?
            {
              vehicleModel:{
                name:{
                  contains: parsed.compatibleVehicle
                }
              }
            }
            :
            {}

          ]

        },

        include:{
          brand:true,
          vehicleModel:true
        }

      });





    if(!product){

      return {

        success:false,

        message:
        'محصول پیدا نشد',

        parsed

      };

    }




    const quantity =
      parsed.quantity || 1;




const log =
  await this.prisma.inventoryLog.create({

    data:{

      productId: product.id,

      locationId: location.id,

      quantity,

      action: 'IN',

      sessionId,

      note: `VOICE: ${text}`

    }

  });


await this.inventoryEngine.increaseStock(
  product.id,
  location.id,
  quantity
);


    return {

      success:true,

      parsed,

      product,

      quantity,

      location,

      log

    };


  }


}
