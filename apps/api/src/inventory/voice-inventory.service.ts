import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsingEngineService } from '../engine/parsing-engine.service';
import { InventoryOperationService } from '../inventory-operation/inventory-operation.service';

@Injectable()
export class VoiceInventoryService {

  constructor(
    private prisma: PrismaService,
    private inventoryOperation: InventoryOperationService,
    private parsingEngine: ParsingEngineService,
  ) {}

  async process(
    locationBarcode: string,
    text: string,
    sessionId: string,
    userId?: string
  ) {

    const location = await this.prisma.location.findUnique({
      where: { barcode: locationBarcode },
    });

    if (!location) {
      throw new Error('Location not found');
    }

    const engineResult = this.parsingEngine.parse(text);

    const parsed = engineResult.data;


    // جلوگیری از ثبت اشتباه وقتی کالا شناسایی نشده
    if (
      !parsed.productName &&
      !parsed.brand &&
      !parsed.vehicleFamily
    ) {
      return {
        success: false,
        needSelection: true,
        message: 'کالا شناسایی نشد',
        parsed,
        suggestions: []
      };
    }


    const product = await this.prisma.product.findFirst({
      where: {
        AND: [
          parsed.productName
            ? {
                name: {
                  contains: parsed.productName,
                  mode: 'insensitive'
                }
              }
            : {},

          parsed.brand
            ? {
                brand: {
                  name: {
                    contains: parsed.brand,
                    mode: 'insensitive'
                  }
                }
              }
            : {},

          parsed.vehicleFamily
            ? {
                vehicleModel: {
                  name: {
                    contains: parsed.vehicleFamily,
                    mode: 'insensitive'
                  }
                }
              }
            : {},
        ],
      },
      include: {
        brand: true,
        vehicleModel: true,
      },
    });


    if (!product) {
      return {
        success:false,
        needSelection:true,
        message:'محصول پیدا نشد',
        parsed,
        suggestions:[]
      };
    }


    const quantity = parsed.quantity || 1;


    const inventory = await this.inventoryOperation.execute({
      type:'IN',
      productId:product.id,
      locationId:location.id,
      quantity,
      note:text,
      source:'VOICE',
      sessionId,
      userId,
    });


    return {
      success:true,
      parsed,
      product,
      quantity,
      location,
      inventory
    };
  }


  // طبق /inventory/voice/confirm — تکمیل عملیات وقتی موتور خودش محصول را پیدا نکرد
  // و کاربر دستی از لیست انتخاب کرده (needSelection:true)
  async confirm(dto:any){

    const { productId, locationBarcode, quantity, sessionId, note, userId } = dto;

    const location = await this.prisma.location.findUnique({
      where:{ barcode:locationBarcode }
    });

    if(!location){
      throw new Error('موقعیت پیدا نشد');
    }

    const inventory = await this.inventoryOperation.execute({
      type:'IN',
      productId,
      locationId:location.id,
      quantity:quantity || 1,
      note:note || 'تایید دستی بعد از عدم تشخیص صوتی',
      source:'VOICE_MANUAL_CONFIRM',
      sessionId,
      userId,
    });

    return { success:true, productId, location, inventory };
  }
}
