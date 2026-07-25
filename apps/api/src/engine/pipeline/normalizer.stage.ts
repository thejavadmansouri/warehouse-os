export class NormalizerStage {


  execute(input:string):string {

    return input
      .replace(/ي/g,'ی')
      .replace(/ك/g,'ک')
      .replace(/‌/g,' ')
      .replace(/[۰-۹]/g,(d)=>
        String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      )
      .replace(/[٠-٩]/g,(d)=>
        String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      )
      .replace(/[^\w\sآ-ی]/g,' ')
      .replace(/\s+/g,' ')
      .trim();

  }

}
