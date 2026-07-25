import { ClassifiedResult } from './classification.stage';
import { ConfidenceResult } from './confidence.stage';


export interface ContextResult {

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



    if(data.condition === 'سالم'){

      goodQuantity = quantity ?? 0;

    }



    if(data.condition === 'خراب'){

      badQuantity = quantity ?? 0;

    }



    if(
      goodQuantity === 0 &&
      badQuantity === 0 &&
      quantity
    ){

      goodQuantity = quantity;

    }



    return {

      productName:
        data.product?.name ?? null,


      category:
        data.product?.category ?? null,


      brand:
        data.brand ?? null,


      vehicleFamily:
        data.vehicle?.family ?? null,


      vehicleVariant:
        data.vehicle?.variant ?? null,


      engine:
        data.engine ??
        data.vehicle?.engine ??
        null,


      gearbox:
        data.gearbox ??
        data.vehicle?.gearbox ??
        null,


      quantity,


      goodQuantity,


      badQuantity,


      confidence:
        confidence.score

    };


  }

}
