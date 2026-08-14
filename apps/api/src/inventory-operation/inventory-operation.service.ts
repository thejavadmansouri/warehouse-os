import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';

@Injectable()
export class InventoryOperationService {
  constructor(
    private prisma: PrismaService,
    private realtime: EventsGateway,
  ) {}

  /**
   * پوششِ نازکِ realtime دورِ تک‌نقطه‌ی تغییر موجودی.
   *
   * هر حرکتِ موجودی (IN/OUT/SALE/RETURN/TRANSFER/ADJUST/COUNT) از هر مسیری —
   * فروش، مرجوعی، دستی، صوتی، sync موبایل — از همین‌جا رد می‌شود، پس یک اعلانِ
   * `stock.changed` اینجا همه را realtime می‌کند.
   *
   * فقط وقتی خودمان تراکنش را مدیریت کرده‌ایم (txClient نداریم، یعنی commit قطعی
   * شده) اعلان می‌دهیم. اگر تراکنش از بیرون آمده (فاکتور فروش/مرجوعی)، صاحبِ آن
   * تراکنش بعد از commitِ خودش اعلانِ دامنه‌ایِ خودش را می‌فرستد؛ این‌طوری روی
   * تراکنشی که ممکن است بعداً rollback شود، زودهنگام اعلان نمی‌دهیم.
   */
  async execute(dto: any, txClient?: Prisma.TransactionClient): Promise<any> {
    const result = await this.runOperation(dto, txClient);
    if (!txClient) {
      this.realtime.broadcast({
        type: 'stock.changed',
        productId: dto?.productId ?? null,
      });
    }
    return result;
  }

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
  private async runOperation(dto: any, txClient?: Prisma.TransactionClient): Promise<any> {

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
      allowNegative,
      invoiceId,
      saleReturnId,
      purchaseId
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

      // قیمت واحد برای دو حرکت معنا دارد: فروش (قیمت فروش) و ورودِ ناشی از
      // فاکتور خرید (قیمت خرید). برای بقیه null می‌ماند — یک ورودِ دستی یا
      // برگشتی قیمتی ندارد که ثبت شود.
      unitPrice:
        ((type === 'SALE' || (type === 'IN' && purchaseId)) && unitPrice != null)
          ? Number(unitPrice)
          : null,

      // تخفیف ردیف هم فقط برای فروش. بدون این، فاکتور چاپی نمی‌تواند نشان دهد
      // تخفیف روی کدام قلم بوده و جمع ردیف‌ها با مبلغ فاکتور نمی‌خواند.
      lineDiscount:
        (type === 'SALE' && lineDiscount != null) ? Number(lineDiscount) : null,

      // ردیف فاکتور فروش (یا ردیف RETURN جبرانیِ ابطال/مرجوعی). برای بقیه null.
      invoiceId: invoiceId ?? null,

      // سند مرجوعی که این حرکتِ RETURN را ساخته — فقط از مسیر برگشت از فروش
      // پر می‌شود؛ برای فروش، ابطال، و بقیه‌ی حرکت‌ها null می‌ماند.
      saleReturnId: saleReturnId ?? null,

      // فاکتور خریدی که این ردیفِ IN را ساخته. مثل فروش، ردیف‌های سند خرید
      // همین رکوردهای لجرند؛ برای ورودِ دستی و صوتی و اسکن null می‌ماند.
      purchaseId: purchaseId ?? null

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
          کسر اتمیک.

          حالت عادی: فقط وقتی کم کن که موجودی کافی باشد — این جلوی race
          condition بین دو برداشتِ هم‌زمان را می‌گیرد.

          allowNegative فقط از مسیر فروش می‌آید. دلیلش این است که در دوره‌ی
          راه‌اندازی، جنس فیزیکاً در انبار هست ولی هنوز در نرم‌افزار ثبت نشده؛
          عددِ صفرِ سیستم غلط است، نه واقعیت. جلوگیری از فروش در این حالت یعنی
          نرم‌افزار جلوی کسب‌وکار را بگیرد. برداشت انباردار (OUT) همچنان محدود
          می‌ماند، چون آنجا صفر یعنی واقعاً چیزی روی قفسه نیست.

          موجودیِ منفی خودش اطلاعات است: یعنی «این تعداد فروخته شد پیش از آنکه
          ثبت شود». وقتی جنس واقعاً ثبت شود، منفی جبران می‌شود.
        */

        if (allowNegative) {

          await tx.inventory.upsert({
            where:{
              productId_locationId:{ productId, locationId }
            },
            // ردیف موجودی وجود ندارد → یعنی هیچ‌وقت ثبت نشده؛ از صفر منفی می‌شود.
            create:{ productId, locationId, quantity: -quantity },
            update:{ quantity:{ decrement: quantity } },
          });

        } else {

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
