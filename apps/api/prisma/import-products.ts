import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();


interface ProductJson {
  name: string;
  partCatalog?: string;
  category?: string;
  brand?: string;
  vehicleFamily?: string;
  vehicleVariant?: string;
  engine?: string;
  gearbox?: string;
  sku: string;
  aliases?: string[];
  voiceAliases?: string[];
}



async function getOrCreateBrand(name?: string) {

  if (!name) return null;


  let brand =
    await prisma.brand.findUnique({
      where:{
        name
      }
    });


  if(!brand){

    brand =
      await prisma.brand.create({
        data:{
          name,
          aliases:[]
        }
      });

  }


  return brand;
}




async function getOrCreateVehicle(
  family?:string,
  variant?:string
){

  if(!family && !variant)
    return null;


  const name =
    variant || family!;



  let vehicle =
    await prisma.vehicleModel.findFirst({
      where:{
        name
      }
    });



  if(!vehicle){

    vehicle =
      await prisma.vehicleModel.create({

        data:{
          name,
          aliases:
            family && family !== name
            ? [family]
            : [],

          startYear:1300,
          endYear:1500

        }

      });

  }


  return vehicle;

}




async function getOrCreatePartCatalog(
  name?:string
){

  if(!name)
    return null;



  let part =
    await prisma.partCatalog.findUnique({
      where:{
        name
      }
    });



  if(!part){

    part =
      await prisma.partCatalog.create({

        data:{
          name,
          aliases:[],
          unit:'عدد'
        }

      });

  }


  return part;

}




async function importProducts(){


const filePath =
path.join(
 __dirname,
 'seeds',
 'products.json'
);



const products:ProductJson[] =
JSON.parse(
 fs.readFileSync(
   filePath,
   'utf8'
 )
);



let counter=0;



for(const item of products){


const brand =
 await getOrCreateBrand(
   item.brand
 );



const vehicle =
 await getOrCreateVehicle(
   item.vehicleFamily,
   item.vehicleVariant
 );



const partCatalog =
 await getOrCreatePartCatalog(
   item.partCatalog
 );





await prisma.product.upsert({

where:{
 sku:item.sku
},


update:{


 name:item.name,


 brandId:
   brand?.id ?? null,


 vehicleModelId:
   vehicle?.id ?? null,


 partCatalogId:
   partCatalog?.id ?? null,


},



create:{


 name:item.name,


 sku:item.sku,


 unit:'عدد',


 brandId:
   brand?.id ?? null,


 vehicleModelId:
   vehicle?.id ?? null,


 partCatalogId:
   partCatalog?.id ?? null,


 description:
   item.aliases?.join(' | ') ?? null


}


});



counter++;


console.log(
`✅ ${counter}/${products.length} ${item.name}`
);


}



console.log(
`\n🎉 Imported ${counter} products`
);


}





importProducts()

.catch(err=>{

console.error(
'❌ Import failed',
err
);

process.exit(1);

})


.finally(async()=>{

await prisma.$disconnect();

});