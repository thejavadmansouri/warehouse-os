import { DomainDictionaryConfig, ParseResult } from './types/engine.types';

import { NormalizerStage } from './pipeline/normalizer.stage';
import { TokenizerStage } from './pipeline/tokenizer.stage';
import { SpellCorrectionStage } from './pipeline/spell-correction.stage';
import { NumberParserStage } from './pipeline/number-parser.stage';
import { MatchingStage } from './pipeline/matching.stage';
import { ClassificationStage } from './pipeline/classification.stage';
import { ValidationStage } from './pipeline/validation.stage';
import { ContextResolutionStage } from './pipeline/context-resolution.stage';
import { ConfidenceStage } from './pipeline/confidence.stage';



export class ParsingEngineCore {


  private normalizer = new NormalizerStage();

  private tokenizer = new TokenizerStage();


  constructor(
    private config:DomainDictionaryConfig
  ){}




  parse(input:string):ParseResult{


    const start =
      performance.now();



    const normalized =
      this.normalizer.execute(input);



    const tokens =
      this.tokenizer.execute(normalized);



    const corrected =
      new SpellCorrectionStage(this.config)
      .execute(tokens);



    const numberResult =
      new NumberParserStage()
      .execute(corrected);



    const words =
      numberResult.map((x:any)=>{

        if(typeof x === 'string'){
          return x;
        }

        if(typeof x.token === 'string'){
          return x.token;
        }

        if(typeof x.text === 'string'){
          return x.text;
        }

        if(typeof x.value === 'string'){
          return x.value;
        }

        return String(x);

      });

    const matched =
      new MatchingStage(this.config)
      .execute(words);



    const classified =
      new ClassificationStage()
      .execute(
        matched,
        numberResult.find((x:any)=>x.value)?.value ?? null
      );



    const validation =
      new ValidationStage()
      .execute(classified);



    const confidence =
      new ConfidenceStage()
      .execute(
        classified,
        validation
      );



    const context =
      new ContextResolutionStage()
      .execute(
        classified,
        confidence,
        numberResult.find((x:any)=>x.value)?.value ?? null
      );



    return {

      success:
        validation.status !== 'Failed',


      data:{
        productName:context.productName ?? null,
        productCategory:context.category ?? null,
        brand:context.brand ?? null,
        vehicleFamily:context.vehicleFamily ?? null,
        vehicleVariant:context.vehicleVariant ?? null,
        engine:context.engine ?? null,
        gearbox:context.gearbox ?? null,
        position:null,
        side:null,
        condition:null,
        year:null,
        quantity:context.quantity ?? null,
        goodQuantity:context.goodQuantity ?? 0,
        badQuantity:context.badQuantity ?? 0
      },


      explanation:{
        goodQuantity:context.goodQuantity ?? 0,
        badQuantity:context.badQuantity ?? 0,
        unknownTokens:classified.unknownTokens,
        validationStatus:validation.status,
        validationMessages:validation.messages ?? [],
        confidence:confidence.score,
        matchedDetails:{}
      },


      rawInput:input,


      processingTimeMs:
        performance.now()-start

    };


  }

}
