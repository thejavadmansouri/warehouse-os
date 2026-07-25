import { TrieDictionary } from '../utils/trie.util';
import { DomainDictionaryConfig } from '../types/engine.types';


export interface MatchingResult {

  product:any|null;

  vehicle:any|null;

  brand:string|null;

  engine:string|null;

  gearbox:string|null;

  condition:string|null;

  unknownTokens:string[];

}



export class MatchingStage {


  private productTrie = new TrieDictionary();

  private vehicleTrie = new TrieDictionary();

  private brandTrie = new TrieDictionary();

  private engineTrie = new TrieDictionary();

  private gearboxTrie = new TrieDictionary();

  private conditionTrie = new TrieDictionary();



  constructor(
    private config:DomainDictionaryConfig
  ){

    this.load();

  }




  private load(){


    for(const item of this.config.products){

      for(const alias of item.aliases){

        this.productTrie.insert(
          alias,
          item
        );

      }

    }



    for(const item of this.config.vehicles){

      for(const alias of item.aliases){

        this.vehicleTrie.insert(
          alias,
          item
        );

      }

    }



    for(const [key,value] of Object.entries(this.config.brands)){

      this.brandTrie.insert(
        key,
        value
      );

    }



    for(const [key,value] of Object.entries(this.config.engines)){

      this.engineTrie.insert(
        key,
        value
      );

    }



    for(const [key,value] of Object.entries(this.config.gearboxes)){

      this.gearboxTrie.insert(
        key,
        value
      );

    }



    for(const [key,value] of Object.entries(this.config.conditions)){

      this.conditionTrie.insert(
        key,
        value
      );

    }


  }





  execute(
    tokens:any[]
  ):MatchingResult {

    tokens = tokens.map((t:any) =>
      typeof t === 'string'
        ? t
        : t.text ?? t.value ?? String(t)
    );



    let product:any=null;

    let vehicle:any=null;

    let brand:string|null=null;

    let engine:string|null=null;

    let gearbox:string|null=null;

    let condition:string|null=null;


    const unknown:string[]=[];



    for(let i=0;i<tokens.length;i++){



      const checks:any[]=[

        [
          this.vehicleTrie,
          'vehicle'
        ],

        [
          this.productTrie,
          'product'
        ],

        [
          this.brandTrie,
          'brand'
        ],

        [
          this.engineTrie,
          'engine'
        ],

        [
          this.gearboxTrie,
          'gearbox'
        ],

        [
          this.conditionTrie,
          'condition'
        ]

      ];



      let found=false;



      for(const [trie,type] of checks){


        const result =
          trie.findLongestMatch(
            tokens,
            i
          );



        if(result){

          if(type==='vehicle')
            vehicle=result.payload;


          if(type==='product')
            product=result.payload;


          if(type==='brand')
            brand=result.payload;


          if(type==='engine')
            engine=result.payload;


          if(type==='gearbox')
            gearbox=result.payload;


          if(type==='condition')
            condition=result.payload;



          i += result.length-1;

          found=true;

          break;

        }


      }



      if(!found){

        unknown.push(tokens[i]);

      }


    }




    return {

      product,

      vehicle,

      brand,

      engine,

      gearbox,

      condition,

      unknownTokens:unknown

    };


  }


}
