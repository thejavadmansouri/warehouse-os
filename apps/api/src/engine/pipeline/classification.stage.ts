import { MatchingResult } from './matching.stage';



export interface ClassifiedResult {

  product:any|null;

  vehicle:any|null;

  productName:string|null;

  category:string|null;

  brand:string|null;

  vehicleFamily:string|null;

  vehicleVariant:string|null;

  engine:string|null;

  gearbox:string|null;

  condition:string|null;

  quantity:number|null;

  goodQuantity:number;

  badQuantity:number;

  unknownTokens:string[];

}





export class ClassificationStage {



  execute(
    matched:MatchingResult,
    quantity:number|null = null
  ):ClassifiedResult {



    const product =
      matched.product ?? null;



    const vehicle =
      matched.vehicle ?? null;



    /**
     * اولویت:
     * 1- تشخیص مستقیم موتور
     * 2- اطلاعات خودرو
     */


    const engine =
      matched.engine ??
      vehicle?.engine ??
      null;



    const gearbox =
      matched.gearbox ??
      vehicle?.gearbox ??
      null;




    /**
     * برند:
     * اگر از متن پیدا شد استفاده کن
     * در غیر این صورت از خود محصول بردار
     */


    const brand =
      matched.brand ??
      product?.brand?.name ??
      null;




    /**
     * دسته بندی:
     * چند منبع برای سازگاری
     */


    const category =
      product?.category ??
      product?.partCatalog?.name ??
      null;




    return {


      product,


      vehicle,



      productName:
        product?.name ??
        null,



      category,



      brand,



      vehicleFamily:
        vehicle?.family ??
        null,



      vehicleVariant:
        vehicle?.variant ??
        null,



      engine,



      gearbox,



      condition:
        matched.condition ??
        null,



      quantity,



      /**
       * اینجا فقط مقدار خام را نگه میداریم
       * تصمیم سالم/خراب در ContextResolutionStage
       */


      goodQuantity:0,


      badQuantity:0,



      unknownTokens:
        matched.unknownTokens ?? []



    };


  }


}