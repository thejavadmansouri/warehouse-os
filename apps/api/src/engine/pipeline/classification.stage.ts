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
      matched.product;



    const vehicle =
      matched.vehicle;



    let engine =
      matched.engine;



    let gearbox =
      matched.gearbox;



    if(vehicle && !engine){

      engine = vehicle.engine;

    }


    if(vehicle && !gearbox){

      gearbox = vehicle.gearbox;

    }




    return {


      product,


      vehicle,


      productName:
        product
          ? product.name
          : null,



      category:
        product
          ? product.category
          : null,



      brand:
        matched.brand,



      vehicleFamily:
        vehicle
          ? vehicle.family
          : null,



      vehicleVariant:
        vehicle
          ? vehicle.variant
          : null,



      engine,



      gearbox,



      condition:
        matched.condition,



      quantity,



      goodQuantity:
        quantity ?? 0,



      badQuantity:0,



      unknownTokens:
        matched.unknownTokens


    };


  }


}
