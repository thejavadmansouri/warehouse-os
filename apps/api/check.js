const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'PartCatalog'`)
  .then(r => { console.log(r); return p.$disconnect(); })
  .catch(e => { console.error(e); process.exit(1); });
