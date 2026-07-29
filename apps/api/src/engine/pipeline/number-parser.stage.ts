import { parseNumberWordSequence } from '../utils/number.util';


export interface ParsedNumber {

  value:number;

  index:number;

  consumed:number;

}



// شماره‌هایی که معمولاً مدل خودرو هستند
const MODEL_NUMBERS = new Set([
  405,
  206,
  207,
  504,
  508,
  301,
  2008,
  3008
]);



const COUNT_UNITS = new Set([
  'عدد',
  'تا',
  'دست',
  'جفت',
  'کارتن',
  'بسته',
  'پک',
  'دستگاه',
  'متر',
  'کیلو',
  'کیلوگرم'
]);




function normalizeDigits(
  input:string
):string {


  const persianDigits =
    '۰۱۲۳۴۵۶۷۸۹';


  const arabicDigits =
    '٠١٢٣٤٥٦٧٨٩';



  return input

    .replace(
      /[۰-۹]/g,
      char =>
        String(
          persianDigits.indexOf(char)
        )
    )


    .replace(
      /[٠-٩]/g,
      char =>
        String(
          arabicDigits.indexOf(char)
        )
    );

}





function isModelNumber(
  value:number
):boolean {


  return MODEL_NUMBERS.has(value);

}





function isVehicleYear(
  value:number
):boolean {


  return (
    value >= 1300 &&
    value <= 1450
  );

}





export class NumberParserStage {



  execute(
    tokens:string[]
  ):ParsedNumber[] {


    const results:ParsedNumber[] = [];




    for(
      let i = 0;
      i < tokens.length;
      i++
    ){


      const rawToken =
        tokens[i];



      const token =
        normalizeDigits(
          rawToken
        );



      const digit =
        Number(token);




      if(
        !isNaN(digit) &&
        token.trim() !== ''
      ){



        // مدل خودرو
        if(
          isModelNumber(digit)
        ){

          continue;

        }




        // سال تولید خودرو
        if(
          isVehicleYear(digit)
        ){

          continue;

        }





        const nextToken =
          tokens[i + 1]
            ?.trim()
            .toLowerCase();




        /*
          اگر بعد از عدد یک کلمه غیرواحد بیاید:
          
          مثال:
          405 تیپ 5

          عدد مدل است نه موجودی
        */

        if(
          nextToken &&
          /^[a-zA-Zآ-ی]+$/.test(nextToken) &&
          !COUNT_UNITS.has(nextToken)
        ){

          continue;

        }





        results.push({

          value:digit,

          index:i,

          consumed:1

        });



        continue;

      }





      const wordNumber =
        parseNumberWordSequence(
          tokens,
          i
        );




      if(wordNumber){


        results.push({

          value:
            wordNumber.value,

          index:i,

          consumed:
            wordNumber.consumed

        });



        i +=
          wordNumber.consumed - 1;


      }



    }



    return results;


  }


}