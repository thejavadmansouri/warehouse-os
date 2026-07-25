import { ClassifiedResult } from './classification.stage';
import { ValidationResult } from './validation.stage';


export interface ConfidenceResult {

  score:number;

  level:'LOW'|'MEDIUM'|'HIGH';

}



export class ConfidenceStage {


  execute(
    data:ClassifiedResult,
    validation:ValidationResult
  ):ConfidenceResult {


    let score = 50;



    // موجودیت اصلی
    if(data.product)
      score += 20;


    if(data.vehicle)
      score += 15;


    if(data.brand)
      score += 10;


    if(data.engine)
      score += 5;


    if(data.gearbox)
      score += 5;



    // خطاهای اعتبارسنجی
    if(validation.status === 'Failed')
      score -= 40;


    if(validation.status === 'Warning')
      score -= 10;



    // کلمات ناشناخته
    score -= data.unknownTokens.length * 5;



    if(score < 0)
      score = 0;


    if(score > 100)
      score = 100;



    let level:'LOW'|'MEDIUM'|'HIGH';


    if(score >= 90)
      level='HIGH';

    else if(score >= 70)
      level='MEDIUM';

    else
      level='LOW';



    return {

      score,

      level

    };

  }

}
