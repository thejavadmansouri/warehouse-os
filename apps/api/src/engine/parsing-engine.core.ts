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


  private readonly normalizer =
    new NormalizerStage();


  private readonly tokenizer =
    new TokenizerStage();


  private readonly numberParser =
    new NumberParserStage();


  private readonly spellCorrection:
    SpellCorrectionStage;


  private readonly matchingStage:
    MatchingStage;



  constructor(
    private config: DomainDictionaryConfig
  ){

    this.matchingStage =
      new MatchingStage(this.config);


    this.spellCorrection =
      new SpellCorrectionStage(this.config);

  }




  parse(input:string):ParseResult {


    const start =
      performance.now();



    /*
      1- Normalize
    */

    const normalized =
      this.normalizer.execute(input);



    /*
      2- Tokenize
    */

    const tokens =
      this.tokenizer.execute(normalized);



    /*
      3- Spell correction
    */

    const corrected =
      this.spellCorrection.execute(tokens);



    /*
      4- Extract numbers
    */

    const numbers =
      this.numberParser.execute(corrected);



    /*
      برای Matching فقط متن لازم است
      نه آبجکت عدد
    */

    const matchingTokens =
      corrected.map((token:any)=>{

        if(typeof token === 'string')
          return token;


        if(token.text)
          return token.text;


        if(token.value)
          return String(token.value);


        return String(token);

      });



    /*
      5- Dictionary Matching
    */

    const matched =
      this.matchingStage.execute(
        matchingTokens
      );



    /*
      6- Classification
    */

    const quantity =
      numbers.length
      ? numbers[0].value
      : null;



    const classified =
      new ClassificationStage()
      .execute(
        matched,
        quantity
      );



    /*
      7- Validation
    */

    const validation =
      new ValidationStage()
      .execute(
        classified
      );



    /*
      8- Confidence
    */

    const confidence =
      new ConfidenceStage()
      .execute(
        classified,
        validation
      );



    /*
      9- Context
    */

    const context =
      new ContextResolutionStage()
      .execute(
        classified,
        confidence,
        quantity
      );




    return {


      success:
        validation.status !== 'Failed',



      data:{


        productName:
          context.productName ?? null,


        productCategory:
          context.category ?? null,


        brand:
          context.brand ?? null,


        vehicleFamily:
          context.vehicleFamily ?? null,


        vehicleVariant:
          context.vehicleVariant ?? null,


        engine:
          context.engine ?? null,


        gearbox:
          context.gearbox ?? null,


        position:null,

        side:null,

        condition:
          classified.condition ?? null,


        year:null,


        quantity:
          context.quantity ?? null,


        goodQuantity:
          context.goodQuantity ?? 0,


        badQuantity:
          context.badQuantity ?? 0

      },




      explanation:{


        tokens,


        normalized,


        correctedTokens:
          corrected,


        numbers,


        goodQuantity:
          context.goodQuantity ?? 0,


        badQuantity:
          context.badQuantity ?? 0,



        unknownTokens:
          classified.unknownTokens,



        validationStatus:
          validation.status,



        validationMessages:
          validation.messages ?? [],



        confidence:
          confidence.score,



        matchedDetails:{


          product:
            matched.product?.name ?? null,


          vehicle:
            matched.vehicle?.name ?? null,


          brand:
            matched.brand ?? null,


          engine:
            matched.engine ?? null,


          gearbox:
            matched.gearbox ?? null

        }

      },




      rawInput:
        input,



      processingTimeMs:
        performance.now()-start

    };


  }

}