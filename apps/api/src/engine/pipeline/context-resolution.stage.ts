import { ClassifiedResult } from './classification.stage';
import { ConfidenceResult } from './confidence.stage';



export interface ContextResult {

  productId:string|null;

  productName:string|null;

  category:string|null;

  brand:string|null;

  vehicleFamily:string|null;

  vehicleVariant:string|null;

  engine:string|null;

  gearbox:string|null;

  quantity:number|null;

  goodQuantity:number;

  badQuantity:number;

  confidence:number;

}





export class ContextResolutionStage {



  execute(
    data:ClassifiedResult,
    confidence:ConfidenceResult,
    quantity:number|null
  ):ContextResult {



    let goodQuantity = 0;

    let badQuantity = 0;



    /**
     * تعیین وضعیت موجودی
     */

    if(data.condition === 'سالم'){

      goodQuantity =
        quantity ?? 0;

    }


    else if(data.condition === 'خراب'){

      badQuantity =
        quantity ?? 0;

    }


    /**
     * اگر وضعیت مشخص نبود
     * پیش فرض کالا سالم است
     */

    else if(quantity !== null){

      goodQuantity =
        quantity;

    }





    /**
     * برند:
     * اول از متن
     * بعد از relation محصول
     */

    const resolvedBrand =
      data.brand ??
      data.product?.brand?.name ??
      null;




    /**
     * دسته بندی:
     * اول category مستقیم
     * بعد partCatalog
     */

    const resolvedCategory =
      data.category ??
      data.product?.category?.name ??
      data.product?.partCatalog?.name ??
      null;






    return {


      productId:
        data.product?.id ??
        null,



      productName:
        data.product?.name ??
        null,



      category:
        resolvedCategory,



      brand:
        resolvedBrand,



      vehicleFamily:
        data.vehicleFamily ??
        data.product?.vehicleModel?.name ??
        null,



      vehicleVariant:
        data.vehicleVariant ??
        data.product?.vehicleModel?.name ??
        null,



      engine:
        data.engine ??
        data.product?.vehicleModel?.engine ??
        null,



      gearbox:
        data.gearbox ??
        data.product?.vehicleModel?.gearbox ??
        null,



      quantity,



      goodQuantity,



      badQuantity,



      confidence:
        confidence.score


    };


  }

}