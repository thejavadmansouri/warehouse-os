export type VoiceParseResult = {
  productName: string;
  brand: string | null;
  compatibleVehicle: string | null;
  quantity: number | null;
};


const PART_BRANDS = [
  "ایساکو",
  "تکستار",
  "TEXTAR",
  "بوش",
  "والئو",
  "لوک",
  "ساکس",
  "مان",
  "فرام",
  "NGK",
  "دنسو",
  "کروز",
  "عظام",
].sort((a,b)=>b.length-a.length);


const VEHICLE_MODELS = [
  "پراید",
  "پژو 206",
  "پژو ۲۰۶",
  "پژو 405",
  "سمند",
  "دنا",
  "تیبا",
  "کوییک",
].sort((a,b)=>b.length-a.length);



const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ENGLISH_DIGITS = "0123456789";


function normalizeDigits(text:string){

 return text.replace(/[۰-۹]/g,(d)=>
   ENGLISH_DIGITS[PERSIAN_DIGITS.indexOf(d)]
 );

}



function numberFromWords(text:string){

 const nums:any={
  "یک":1,
  "دو":2,
  "سه":3,
  "چهار":4,
  "پنج":5,
  "شش":6,
  "هفت":7,
  "هشت":8,
  "نه":9,
  "ده":10,
  "بیست":20,
  "سی":30,
  "چهل":40,
  "پنجاه":50,
  "صد":100
 };


 return nums[text] || null;

}



function normalizeText(text:string){

 return normalizeDigits(text)
 .replace(/ي/g,"ی")
 .replace(/ك/g,"ک")
 .replace(/\s+/g," ")
 .trim();

}



function removeWord(text:string,word:string){

 return text
 .replace(
 new RegExp(`(^|\\s)${word}(?=\\s|$)`,"gi"),
 " "
 )
 .replace(/\s+/g," ")
 .trim();

}



export function extractInventoryFromVoice(sentence:string):VoiceParseResult{


 let text=normalizeText(sentence);


 let quantity:number|null=null;


 const digitMatch=text.match(/(\d+)\s*(عدد|تا|جفت|دست)?/);

 if(digitMatch){

  quantity=Number(digitMatch[1]);

  text=text.replace(digitMatch[0]," ");

 }
 else{

  const words=text.split(" ");

  for(const w of words){

   const n=numberFromWords(w);

   if(n){

    quantity=n;
    text=removeWord(text,w);
    break;

   }

  }

 }


 let brand:string|null=null;


 for(const b of PART_BRANDS){

  if(text.toLowerCase().includes(b.toLowerCase())){

    brand=b;

    text=removeWord(text,b);

    break;

  }

 }



 let compatibleVehicle:string|null=null;


 for(const v of VEHICLE_MODELS){

  if(text.includes(v)){

   compatibleVehicle=v;

   text=removeWord(text,v);

   break;

  }

 }



 text=text
 .replace(/عدد|تا|موجودی|دارم/g," ")
 .replace(/\s+/g," ")
 .trim();



 return {

  productName:text,
  brand,
  compatibleVehicle,
  quantity

 };


}
