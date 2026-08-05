import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryOperationService {
  constructor(private prisma: PrismaService) {}

  /**
   * تک‌نقطه‌ی تغییر موجودی (قانون ۱).
   *
   * @param txClient اختیاری. اگر داده شود، عملیات داخل همان تراکنشِ صداکننده
   *   اجرا می‌شود بجای اینکه خودش تراکنش جدید باز کند. برای عملیات چندردیفی
   *   مثل فاکتور فروش لازم است: بدون آن هر ردیف تراکنش جداگانه دارد و اگر
   *   ردیف چهارم موجودی کم بیاورد، سه ردیف اول از انبار کم شده باقی می‌مانند.
   *
   *   وقتی داده نشود رفتار دقیقاً مثل قبل است — همه‌ی صداکننده‌های موجود
   *   (voice، count، transfer، pending-operations، product-requests و …)
   *   بدون تغییر کار می‌کنند.
   */
  async execute(dto: any, txClient?: Prisma.TransactionClient): Promise<any> {

    // وقتی تراکنش بیرونی داریم از همان استفاده کن، وگرنه تراکنش خودت را باز کن.
    const db: Prisma.TransactionClient | PrismaService = txClient ?? this.prisma;

    const runInTx = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      txClient ? fn(txClient) : this.prisma.$transaction(fn);

    const {
      type,
      productId,
      locationId,
      toLocationId,
      note,
      userId,
      sessionId,
      voiceRecordId,
      unitPrice,
      lineDiscount,
      invoiceId
    } = dto;


    if (sessionId) {

      const session =
        await db.inventorySession.findUnique({
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

      note:note ?? null,

      // قیمت واحد فقط برای فروش معنا دارد؛ برای بقیه‌ی حرکت‌ها null می‌ماند
      unitPrice:
        (type === 'SALE' && unitPrice != null) ? Number(unitPrice) : null,

      // تخفیف ردیف هم فقط برای فروش. بدون این، فاکتور چاپی نمی‌تواند نشان دهد
      // تخفیف روی کدام قلم بوده و جمع ردیف‌ها با مبلغ فاکتور نمی‌خواند.
      lineDiscount:
        (type === 'SALE' && lineDiscount != null) ? Number(lineDiscount) : null,

      // ردیف فاکتور فروش (یا ردیف RETURN جبرانیِ ابطال). برای بقیه null.
      invoiceId: invoiceId ?? null

    };




    // =========================
    // IN / RETURN
    // =========================
    // RETURN همان افزایش موجودی است، فقط در لجر با action دیگری ثبت می‌شود.
    // برای ابطال فاکتور استفاده می‌شود: ردیف فروش حذف نمی‌شود، یک حرکت جبرانی
    // ثبت می‌شود تا لجر append-only بماند (قانون ۲).

    if(type === 'IN' || type === 'RETURN'){

      return runInTx(async(tx)=>{


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
            action: type === 'RETURN' ? 'RETURN' : 'IN'
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


      return runInTx(async(tx)=>{


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
        await runInTx(async(tx)=>{



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



      return runInTx(async(tx)=>{


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
