import { ClassifiedResult } from './classification.stage';


export interface ValidationResult {

  status:'Passed'|'Failed'|'Warning';

  messages:string[];

}



export class ValidationStage {



  execute(data:ClassifiedResult):ValidationResult {


    const messages:string[] = [];

    let status:'Passed'|'Failed'|'Warning' = 'Passed';



    // بررسی سازگاری قطعه با خودرو
    if(
      data.product &&
      data.vehicle &&
      data.product.validVehicles
    ){

      if(
        !data.product.validVehicles.includes(
          data.vehicle.family
        )
      ){

        status='Failed';

        messages.push(
          `قطعه ${data.product.name} با ${data.vehicle.family} سازگار نیست`
        );

      }

    }



    // بررسی موتور
    if(
      data.vehicle &&
      data.engine &&
      data.vehicle.engine
    ){

      if(
        data.vehicle.engine !== data.engine
      ){

        status='Failed';

        messages.push(
          `موتور ${data.engine} برای ${data.vehicle.variant} معتبر نیست`
        );

      }

    }



    // داده ناقص
    if(
      !data.product
    ){

      status='Warning';

      messages.push(
        'نام قطعه شناسایی نشد'
      );

    }



    return {

      status,

      messages

    };

  }


}
