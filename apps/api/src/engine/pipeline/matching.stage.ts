import { TrieDictionary } from '../utils/trie.util';
import { DomainDictionaryConfig } from '../types/engine.types';
import { normalizePersian } from '../utils/persian-normalize';


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


    // Keys are normalized so they match the normalized token stream; payloads
    // keep their original (raw) values for downstream display/lookup.
    for(const item of this.config.products){

      for(const alias of item.aliases){

        this.productTrie.insert(
          normalizePersian(alias),
          item
        );

      }

    }



    for(const item of this.config.vehicles){

      for(const alias of item.aliases){

        this.vehicleTrie.insert(
          normalizePersian(alias),
          item
        );

      }

    }



    for(const [key,value] of Object.entries(this.config.brands)){

      this.brandTrie.insert(
        normalizePersian(key),
        value
      );

    }



    for(const [key,value] of Object.entries(this.config.engines)){

      this.engineTrie.insert(
        normalizePersian(key),
        value
      );

    }



    for(const [key,value] of Object.entries(this.config.gearboxes)){

      this.gearboxTrie.insert(
        normalizePersian(key),
        value
      );

    }



    for(const [key,value] of Object.entries(this.config.conditions)){

      this.conditionTrie.insert(
        normalizePersian(key),
        value
      );

    }


  }





execute(tokens:any[]):MatchingResult {


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


        const payloads =
          result.payloads ?? [];



        if(type==='vehicle'){

          vehicle =
            this.resolveBestVehicle(
              payloads,
              tokens
            );

        }



        if(type==='product'){

          product =
            payloads[0] ?? null;

        }



        if(type==='brand'){

          brand =
            payloads[0] ?? null;

        }



        if(type==='engine'){

          engine =
            payloads[0] ?? null;

        }



        if(type==='gearbox'){

          gearbox =
            payloads[0] ?? null;

        }



        if(type==='condition'){

          condition =
            payloads[0] ?? null;

        }



        i += result.length - 1;


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





private resolveBestVehicle(
  vehicles:any[],
  tokens:string[]
){


  if(!vehicles.length)
    return null;



  if(vehicles.length===1)
    return vehicles[0];



  const joined =
    tokens.join(' ');



  const exact =
    vehicles.find(v=>{


      if(!v)
        return false;


      const name =
        String(v.name ?? '')
        .toLowerCase();



      return joined
        .toLowerCase()
        .includes(name);


    });



  return exact ?? null;


}



}