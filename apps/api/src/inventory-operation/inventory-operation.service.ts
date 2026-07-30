import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryOperationService {
  constructor(private prisma: PrismaService) {}

  async execute(dto: any): Promise<any> {

    const {
      type,
      productId,
      locationId,
      toLocationId,
      note,
      userId,
      sessionId,
      voiceRecordId
    } = dto;


    if (sessionId) {

      const session =
        await this.prisma.inventorySession.findUnique({
          where:{
            id:sessionId
          }
        });


      if(!session){

        throw new NotFoundException({
          error:'SESSION_NOT_FOUND',
          message:'سشن انبارگردانی معتبر نیست'
        });

      }

    }



    const source =
      dto.source || 'MANUAL';


    const quantity =
      Number(dto.quantity);



    if(type !== 'ADJUST' && (!quantity || quantity <= 0)){

      throw new BadRequestException({
        error:'INVALID_QUANTITY'
      });

    }



    const logBase = {

      productId,

      userId:userId ?? null,

      sessionId:sessionId ?? null,

      voiceRecordId:voiceRecordId ?? null,

      source,

      note:note ?? null

    };




    // =========================
    // IN
    // =========================

    if(type === 'IN'){

      return this.prisma.$transaction(async(tx)=>{


        const updated =
          await tx.inventory.upsert({

            where:{
              productId_locationId:{
                productId,
                locationId
              }
            },


            update:{
              quantity:{
                increment:quantity
              }
            },


            create:{
              productId,
              locationId,
              quantity
            }

          });



        const log = await tx.inventoryLog.create({

          data:{
            ...logBase,
            locationId,
            quantity,
            action:'IN'
          }

        });


        // Return the stock row plus the created ledger id. Additive: existing IN
        // callers read the inventory fields and ignore inventoryLogId; approve()
        // uses it to back-link the pending op and its photo(s) to the ledger row.
        return { ...updated, inventoryLogId: log.id };


      });


    }





    // =========================
    // OUT / SALE
    // =========================

    if(type === 'OUT' || type === 'SALE'){


      return this.prisma.$transaction(async(tx)=>{


        /*
          عملیات اتمیک:
          فقط وقتی کم کن که موجودی کافی باشد.
          این جلوی race condition را می گیرد.
        */

        const result =
          await tx.inventory.updateMany({

            where:{

              productId,

              locationId,

              quantity:{
                gte:quantity
              }

            },


            data:{

              quantity:{
                decrement:quantity
              }

            }


          });



        if(result.count === 0){


          const current =
            await tx.inventory.findUnique({

              where:{
                productId_locationId:{
                  productId,
                  locationId
                }
              }

            });



          throw new BadRequestException({

            error:'INSUFFICIENT_STOCK',

            available:
              current?.quantity ?? 0

          });


        }



        const updated =
          await tx.inventory.findUnique({

            where:{
              productId_locationId:{
                productId,
                locationId
              }
            }

          });



        await tx.inventoryLog.create({

          data:{

            ...logBase,

            locationId,

            quantity,

            action:
              type === 'SALE'
              ? 'SALE'
              : 'OUT'

          }

        });



        return updated;



      });


    }





    // =========================
    // TRANSFER
    // =========================


    if(type === 'TRANSFER'){


      if(!toLocationId){

        throw new BadRequestException({
          error:'DESTINATION_REQUIRED'
        });

      }



      const result =
        await this.prisma.$transaction(async(tx)=>{



          /*
             کم کردن از مبدا به صورت atomic
          */


          const removed =
            await tx.inventory.updateMany({

              where:{

                productId,

                locationId,

                quantity:{
                  gte:quantity
                }

              },


              data:{

                quantity:{
                  decrement:quantity
                }

              }

            });



          if(removed.count === 0){


            const current =
              await tx.inventory.findUnique({

                where:{
                  productId_locationId:{
                    productId,
                    locationId
                  }
                }

              });



            throw new BadRequestException({

              error:'INSUFFICIENT_STOCK',

              available:
                current?.quantity ?? 0

            });


          }




          const destination =
            await tx.inventory.upsert({

              where:{

                productId_locationId:{
                  productId,
                  locationId:toLocationId
                }

              },


              update:{

                quantity:{
                  increment:quantity
                }

              },


              create:{

                productId,

                locationId:toLocationId,

                quantity

              }

            });




          await tx.inventoryLog.createMany({

            data:[

              {

                ...logBase,

                locationId,

                quantity,

                action:'TRANSFER',

                note:`TRANSFER OUT -> ${toLocationId}`

              },


              {

                ...logBase,

                locationId:toLocationId,

                quantity,

action:'TRANSFER',
note:`TRANSFER IN <- ${locationId}`

              }


            ]

          });



          return destination;


        });



      return {

        success:true,

        operation:'TRANSFER',

        quantity,

        inventory:result

      };


    }






    // =========================
    // ADJUST
    // =========================


    if(type === 'ADJUST'){


      const targetQty =
        Number(dto.targetQuantity);



      if(isNaN(targetQty) || targetQty < 0){

        throw new BadRequestException({
          error:'INVALID_TARGET_QUANTITY'
        });

      }



      return this.prisma.$transaction(async(tx)=>{


        const inventory =
          await tx.inventory.findUnique({

            where:{
              productId_locationId:{
                productId,
                locationId
              }
            }

          });



        const oldQty =
          inventory?.quantity ?? 0;



        const diff =
          targetQty-oldQty;



        const updated =
          await tx.inventory.upsert({

            where:{
              productId_locationId:{
                productId,
                locationId
              }
            },


            update:{
              quantity:targetQty
            },


            create:{
              productId,
              locationId,
              quantity:targetQty
            }


          });



        if(diff !== 0){

          await tx.inventoryLog.create({

            data:{

              ...logBase,

              locationId,

              quantity:diff,

              action:'ADJUST'

            }

          });

        }



        return {

          success:true,

          operation:'ADJUST',

          oldQty,

          newQty:targetQty,

          diff,

          inventory:updated

        };


      });


    }



    throw new BadRequestException({
      error:'INVALID_OPERATION_TYPE'
    });


  }

}
