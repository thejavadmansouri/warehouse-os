import {
 Injectable,
 BadRequestException,
 NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { GenerateLocationTreeDto } from './dto/generate-location-tree.dto';


interface ParentRef {
 id:string|null;
 code:string;
 path:string;
 depth:number;
}


interface LevelSpec {
 locationTypeId:string;
 count:number;
 prefix?:string;
 naming?:'numeric'|'alpha';
}



const CHUNK_SIZE=3000;



function chunk<T>(
 arr:T[],
 size:number
){
 const result:T[][]=[];

 for(
 let i=0;
 i<arr.length;
 i+=size
 ){
  result.push(
   arr.slice(i,i+size)
  );
 }

 return result;
}



function alpha(index:number){

 let n=index;
 let s='';

 do{

 s=
 String.fromCharCode(
 65+(n%26)
 )+s;

 n=Math.floor(n/26)-1;

 }
 while(n>=0);


 return s;

}



function label(
 index:number,
 total:number,
 naming:'numeric'|'alpha'
){

 if(naming==='alpha')
 return alpha(index);


return String(index+1)
  .padStart(2,'0');

}




@Injectable()
export class LocationBuilderService {


constructor(
 private prisma:PrismaService
){}




async generateTree(
 dto:GenerateLocationTreeDto
){


if(
 !dto.levels ||
 !dto.levels.length
)
throw new BadRequestException(
'سطح لوکیشن ارسال نشده'
);



const warehouse =
await this.prisma.warehouse.findUnique({

where:{
 id:dto.warehouseId
}

});


if(!warehouse)
throw new NotFoundException(
'انبار پیدا نشد'
);



let root:ParentRef={

id:null,

code:warehouse.code,

path:warehouse.code,

depth:-1

};




if(dto.parentId){

const parent=
await this.prisma.location.findUnique({

where:{
 id:dto.parentId
}

});


if(!parent)
throw new NotFoundException(
'والد پیدا نشد'
);


root={

id:parent.id,

code:parent.code,

path:parent.path,

depth:parent.depth

};


}





const ids =
[
...new Set(
dto.levels.map(
x=>x.locationTypeId
)
)
];



const types =
await this.prisma.locationType.findMany({

where:{

id:{
in:ids
},

warehouseId:dto.warehouseId

}

});



const typeMap =
new Map(
types.map(
x=>[
x.id,
x
]
)
);



if(
typeMap.size!==ids.length
)
throw new BadRequestException(
'نوع لوکیشن اشتباه است'
);






let parents:ParentRef[]=[
root
];


let created=0;

let skipped=0;




await this.prisma.$transaction(

async(tx)=>{


for(
const level of dto.levels
){


const type = typeMap.get(level.locationTypeId);

if (!type) {
  throw new BadRequestException(
    `نوع لوکیشن پیدا نشد: ${level.locationTypeId}`
  );
}



const candidates:string[]=[];



for(
const parent of parents
){


for(
let i=0;
i<level.count;
i++
){

const lbl=
label(
i,
level.count,
level.naming??'numeric'
);


candidates.push(
`${parent.code}-${lbl}`
);


}

}




const existing =
await tx.location.findMany({

where:{

code:{
in:candidates
}

},

select:{

id:true,
code:true,
path:true,
depth:true

}

});



const existingMap=
new Map(
existing.map(
x=>[
x.code,
x
]
)
);



const next:ParentRef[]=[];

const inserts:any[]=[];



for(
const parent of parents
){



for(
let i=0;
i<level.count;
i++
){


const lbl=
label(
i,
level.count,
level.naming??'numeric'
);



const code=
`${parent.code}-${lbl}`;



const old=
existingMap.get(code);



if(old){

skipped++;

next.push({

id:old.id,

code:old.code,

path:old.path,

depth:old.depth

});


continue;

}





const id=randomUUID();



const currentName =
level.prefix
?
`${level.prefix} ${lbl}`
:
`${type.name} ${lbl}`;


const path =
parent.path
?
`${parent.path} > ${currentName}`
:
currentName;



const item={


id,

name: currentName,


code,


barcode:
`LOC-${code}`,



path,


depth:type.depth,


warehouseId:dto.warehouseId,


typeId:type.id,


parentId:parent.id,


sortOrder:i


};



inserts.push(item);



next.push({

id,

code,

path,

depth:type.depth

});



}



}



for(
const part of chunk(
inserts,
CHUNK_SIZE
)
){


await tx.location.createMany({

data:part

});


created+=part.length;


}




parents=next;



}




},

{

timeout:120000,

maxWait:10000

}

);





return {

createdCount:created,

skippedCount:skipped,

leafCount:parents.length

};


}



}