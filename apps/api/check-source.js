const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.$queryRawUnsafe(`
SELECT column_name 
FROM information_schema.columns 
WHERE table_name='InventoryLog'
ORDER BY column_name;
`)
.then(r=>{
 console.log(r);
 return p.$disconnect();
});
