import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryOperationService {

  constructor(
    private prisma: PrismaService
  ) {}


  async execute(dto:any){

    const {
      type,
      productId,
      locationId,
      toLocationId,
      quantity,
      note,
      userId,
      source
    } = dto;



    const inventory =
      await this.prisma.inventory.findUnique({

        where:{
          productId_locationId:{
            productId,
            locationId
          }
        }

      });



    if(type === 'IN'){


      const updated =
        await this.prisma.inventory.upsert({

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



      await this.prisma.inventoryLog.create({

        data:{
          productId,
          locationId,
          quantity,
          action:'IN',
          note:`${source || 'SYSTEM'}: ${note || 'ورود'}`,
          userId:userId || null
        }

      });


      return updated;

    }




    if(type === 'OUT' || type === 'SALE'){


      if(!inventory || inventory.quantity < quantity){

        throw new Error('موجودی کافی نیست');

      }



      const updated =
        await this.prisma.inventory.update({

          where:{
            productId_locationId:{
              productId,
              locationId
            }
          },


          data:{
            quantity:{
              decrement:quantity
            }
          }

        });



      await this.prisma.inventoryLog.create({

        data:{
          productId,
          locationId,
          quantity,
          action:type === 'SALE' ? 'SALE':'OUT',
          note:`${source || 'SYSTEM'}: ${note || 'خروج'}`,
          userId:userId || null
        }

      });



      return updated;

    }





    if(type === 'TRANSFER'){


      if(!toLocationId){

        throw new Error('مقصد انتقال مشخص نیست');

      }



      if(!inventory || inventory.quantity < quantity){

        throw new Error('موجودی کافی نیست');

      }



      const result =
        await this.prisma.$transaction(async(tx)=>{


          await tx.inventory.update({

            where:{
              productId_locationId:{
                productId,
                locationId
              }
            },


            data:{
              quantity:{
                decrement:quantity
              }
            }

          });



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
                productId,
                locationId,
                quantity,
                action:'TRANSFER',
                note:`TRANSFER OUT -> ${toLocationId}`,
                userId:userId || null
              },


              {
                productId,
                locationId:toLocationId,
                quantity,
                action:'TRANSFER',
                note:`TRANSFER IN <- ${locationId}`,
                userId:userId || null
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





    throw new Error('نوع عملیات نامعتبر');

  }

}
