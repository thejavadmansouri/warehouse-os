import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {

  console.log("🌱 Dictionary seed started");


  // -----------------
  // Brands
  // -----------------

  const brands = [
    "تکستار",
    "بوش",
    "والئو",
    "لوک",
    "ساکس",
    "NGK",
    "دنسو",
    "کروز",
    "عظام",
    "ایساکو"
  ];


  for (const name of brands) {

    await prisma.brand.upsert({

      where:{
        name
      },

      update:{},

      create:{
        name,
        aliases:[]
      }

    });

  }



  // -----------------
  // Vehicle Models
  // -----------------

  const vehicles = [

    {
      name:"پراید",
      startYear:1370,
      endYear:1399
    },

    {
      name:"405",
      startYear:1370,
      endYear:1405
    },

    {
      name:"سمند",
      startYear:1380,
      endYear:1405
    },

    {
      name:"دنا",
      startYear:1393,
      endYear:1405
    },

    {
      name:"تیبا",
      startYear:1390,
      endYear:1405
    }

  ];


  for(const v of vehicles){

    await prisma.vehicleModel.upsert({

      where:{
        name_startYear_endYear:{
          name:v.name,
          startYear:v.startYear,
          endYear:v.endYear
        }
      },

      update:{},

      create:{
        name:v.name,
        startYear:v.startYear,
        endYear:v.endYear,
        aliases:[]
      }

    });

  }



  // -----------------
  // Part Catalog
  // -----------------

  const parts=[

    {
      name:"لنت ترمز",
      aliases:[
        "لنت",
        "لنت جلو",
        "لنت عقب"
      ]
    },


    {
      name:"شمع موتور",
      aliases:[
        "شمع",
        "شمع ماشین"
      ]
    },


    {
      name:"سپر",
      aliases:[
        "سپر جلو",
        "سپر عقب"
      ]
    },


    {
      name:"چراغ",
      aliases:[
        "چراغ جلو",
        "چراغ عقب"
      ]
    }

  ];


  for(const p of parts){

    await prisma.partCatalog.upsert({

      where:{
        name:p.name
      },

      update:{},

      create:{
        name:p.name,
        aliases:p.aliases
      }

    });

  }


  console.log("✅ Dictionary seed finished");

}


main()
.then(()=>prisma.$disconnect())
.catch(async e=>{
 console.error(e);
 await prisma.$disconnect();
 process.exit(1);
});
