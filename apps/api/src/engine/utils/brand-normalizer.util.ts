export function normalizeBrand(
  value:string|null
):string|null {


  if(!value)
    return null;


  const map:Record<string,string>={

    "textar":"تکستار",
    "TEXTAR":"تکستار",
    "textar ":"تکستار",

  };


  const key =
    value
      .trim()
      .toLowerCase();



  return map[key] ?? value.trim();

}