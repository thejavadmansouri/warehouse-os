import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Seed execution...');

  // 1. SEED BRANDS
  const brands = [
    { name: 'بوش', aliases: ['Bosch', 'بوش آلمان'] },
    { name: 'تکستار', aliases: ['Textar', 'تکستار آلمان'] },
    { name: 'والئو', aliases: ['Valeo', 'والئو فرانسه'] },
    { name: 'لوک', aliases: ['LUK', 'لوک آلمان'] },
    { name: 'ساکس', aliases: ['Sachs', 'ساکس آلمان'] },
    { name: 'مان', aliases: ['Mann', 'مان فیلتر', 'Mann Filter'] },
    { name: 'فرام', aliases: ['Fram', 'فرام فیلتر'] },
    { name: 'ان‌جی‌کی', aliases: ['NGK', 'ان جی کی', 'ان‌جی‌کی ژاپن'] },
    { name: 'دنسو', aliases: ['Denso', 'دنسو ژاپن'] },
    { name: 'کروز', aliases: ['Cruise', 'کروز ایران'] },
    { name: 'عظام', aliases: ['Ezam', 'گروه عظام'] },
    { name: 'ایساکو', aliases: ['ISACO', 'ایساکو شرکتی'] },
    { name: 'سایپا یدک', aliases: ['Saipa Yadak', 'سایپایدک'] },
    { name: 'دیناپارت', aliases: ['Dina Part', 'دینا پارت'] },
    { name: 'موتورژن', aliases: ['Motogen'] },
    { name: 'سرمر', aliases: ['Sermer'] },
    { name: 'ام‌کی‌کی', aliases: ['MKK'] },
    { name: 'آفرام', aliases: ['Afram'] },
    { name: 'پارس لنت', aliases: ['Pars Lent', 'پارس'] },
    { name: 'جهان لنت', aliases: ['Jahan Lent'] },
    { name: 'مهرکام پارس', aliases: ['Meharkam Pars'] },
    { name: 'کوشا پیشرو', aliases: ['Koosha Pishro'] },
    { name: 'پیربرگ', aliases: ['Pierburg'] },
    { name: 'ماهل', aliases: ['Mahle', 'ماهله'] },
    { name: 'گتس', aliases: ['Gates', 'گتس بلژیک'] },
    { name: 'دایکو', aliases: ['Dayco', 'دایکو ایتالیا'] },
    { name: 'کنپارس', aliases: ['Canpars'] },
    { name: 'متفرقه', aliases: ['بازار', 'غیرشرکتی'] },
    { name: 'شرکتی', aliases: ['اصل', 'شرکتی اصلی'] },
    { name: 'بدون برند', aliases: ['Generic', 'بی نام'] },
  ];

  for (const b of brands) {
    await prisma.brand.upsert({
      where: { name: b.name },
      update: { aliases: b.aliases },
      create: { name: b.name, aliases: b.aliases },
    });
  }
  console.log(`✅ ${brands.length} Brands seeded.`);

  // 2. SEED VEHICLE MODELS
  const vehicles = [
    { name: 'پراید 111', aliases: ['111', 'پراید هاچبک'], startYear: 1389, endYear: 1399 },
    { name: 'پراید 131', aliases: ['131', 'پراید صندوقدار'], startYear: 1389, endYear: 1399 },
    { name: 'پراید 132', aliases: ['132'], startYear: 1387, endYear: 1398 },
    { name: 'پراید 141', aliases: ['141'], startYear: 1382, endYear: 1393 },
    { name: 'پراید 151', aliases: ['151', 'پراید وانت'], startYear: 1392, endYear: 1403 },
    { name: 'پراید صبا', aliases: ['صبا', 'پراید قدیم'], startYear: 1372, endYear: 1389 },
    { name: 'پراید نسیم', aliases: ['نسیم'], startYear: 1372, endYear: 1387 },
    { name: 'تیبا 1', aliases: ['تیبا صندوقدار', 'تیبا'], startYear: 1389, endYear: 1401 },
    { name: 'تیبا 2', aliases: ['تیبا هاچبک'], startYear: 1392, endYear: 1401 },
    { name: 'ساینا', aliases: ['ساینا معمولی', 'ساینا EX'], startYear: 1395, endYear: 1403 },
    { name: 'ساینا S', aliases: ['ساینا اس'], startYear: 1399, endYear: 1403 },
    { name: 'کوییک', aliases: ['کوییک معمولی', 'کوییک دنده‌ای'], startYear: 1397, endYear: 1403 },
    { name: 'کوییک R', aliases: ['کوییک آر', 'کوییک دو رنگ'], startYear: 1398, endYear: 1403 },
    { name: 'کوییک S', aliases: ['کوییک اس'], startYear: 1400, endYear: 1403 },
    { name: 'شاهین', aliases: ['شاهین G'], startYear: 1400, endYear: 1403 },
    { name: 'پژو 405 GLX', aliases: ['405', 'پژو 405', 'جی ال ایکس'], startYear: 1370, endYear: 1399 },
    { name: 'پژو 405 SLX', aliases: ['405 اس ال ایکس', '405 موتور TU5'], startYear: 1388, endYear: 1399 },
    { name: 'پژو پارس سال', aliases: ['پرشیا', 'پارس سال', 'پارس معمولی'], startYear: 1379, endYear: 1402 },
    { name: 'پژو پارس TU5', aliases: ['پارس LX', 'پارس تیپ ۵', 'پارس موتور جدید'], startYear: 1390, endYear: 1402 },
    { name: 'پژو پارس ELX', aliases: ['پارس موتور زانتیا', 'ای ال ایکس'], startYear: 1382, endYear: 1392 },
    { name: 'سمند LX', aliases: ['سمند ال ایکس', 'سمند سخنگو'], startYear: 1383, endYear: 1401 },
    { name: 'سمند EF7', aliases: ['سمند ای اف سون', 'سمند ملی'], startYear: 1387, endYear: 1401 },
    { name: 'سمند SE', aliases: ['سمند اس ای'], startYear: 1389, endYear: 1397 },
    { name: 'سورن', aliases: ['سورن معمولی'], startYear: 1385, endYear: 1393 },
    { name: 'سورن ELX', aliases: ['سورن ای ال ایکس'], startYear: 1390, endYear: 1400 },
    { name: 'سورن پلاس', aliases: ['سورن پلاس EF7'], startYear: 1399, endYear: 1403 },
    { name: 'دنا', aliases: ['دنا معمولی', 'دنا دنده‌ای'], startYear: 1393, endYear: 1401 },
    { name: 'دنا پلاس', aliases: ['دنا پلاس دنده‌ای'], startYear: 1395, endYear: 1403 },
    { name: 'دنا پلاس توربو', aliases: ['دنا توربو', 'دنا توربو اتوماتیک'], startYear: 1397, endYear: 1403 },
    { name: 'پژو 206 تیپ 2', aliases: ['206 تیپ ۲', 'پژو 206 تیپ ۲'], startYear: 1380, endYear: 1401 },
    { name: 'پژو 206 تیپ 3', aliases: ['206 تیپ ۳'], startYear: 1382, endYear: 1390 },
    { name: 'پژو 206 تیپ 5', aliases: ['206 تیپ ۵', '206 موتور بزرگ'], startYear: 1382, endYear: 1401 },
    { name: 'پژو 206 SD V8', aliases: ['206 صندوقدار', 'V8', '206 SD'], startYear: 1385, endYear: 1400 },
    { name: 'پژو 207 دنده‌ای', aliases: ['207', '207 هاچبک'], startYear: 1389, endYear: 1403 },
    { name: 'پژو 207 اتوماتیک', aliases: ['207 اتومات'], startYear: 1396, endYear: 1403 },
    { name: 'پژو 207 MC', aliases: ['207 سقف قرمز', '207 مولتی کالر'], startYear: 1401, endYear: 1403 },
    { name: 'رانا', aliases: ['رانا LX'], startYear: 1391, endYear: 1399 },
    { name: 'رانا پلاس', aliases: ['رانا پلاس پانوراما'], startYear: 1399, endYear: 1403 },
    { name: 'تندر 90', aliases: ['L90', 'ال 90', 'ال90 معمولی'], startYear: 1386, endYear: 1398 },
    { name: 'تندر 90 E2', aliases: ['ال90 فول', 'L90 E2'], startYear: 1387, endYear: 1398 },
    { name: 'تندر 90 پلاس', aliases: ['ال90 پلاس'], startYear: 1396, endYear: 1398 },
    { name: 'پارس تندر', aliases: ['پارس تندر آپکو'], startYear: 1392, endYear: 1398 },
    { name: 'ساندرو', aliases: ['رنو ساندرو دنده‌ای'], startYear: 1394, endYear: 1398 },
    { name: 'ساندرو استپ وی', aliases: ['استپ وی', 'Stepway'], startYear: 1395, endYear: 1398 },
    { name: 'مگان 1600', aliases: ['مگان دنده‌ای'], startYear: 1387, endYear: 1392 },
    { name: 'مگان 2000', aliases: ['مگان اتوماتیک'], startYear: 1387, endYear: 1393 },
    { name: 'زانتیا 1800', aliases: ['زانتیا سوپر لوکس'], startYear: 1380, endYear: 1388 },
    { name: 'زانتیا 2000', aliases: ['زانتیا ۲۰۰۰'], startYear: 1381, endYear: 1389 },
    { name: 'پژو 2008', aliases: ['2008'], startYear: 1396, endYear: 1399 },
    { name: 'هایما S7', aliases: ['هایما S7 توربو'], startYear: 1394, endYear: 1403 },
    { name: 'هایما S5', aliases: ['هایما S5 توربو'], startYear: 1396, endYear: 1403 },
    { name: 'جک J5', aliases: ['J5 دنده‌ای', 'J5 اتوماتیک'], startYear: 1392, endYear: 1396 },
    { name: 'جک S5', aliases: ['JAC S5', 'جک S5 توربو'], startYear: 1394, endYear: 1403 },
    { name: 'چری تیگو 5', aliases: ['تیگو 5', 'Tiggo 5'], startYear: 1394, endYear: 1400 },
    { name: 'چری آریزو 5', aliases: ['آریزو 5 توربو'], startYear: 1395, endYear: 1403 },
    { name: 'ام‌وی‌ام 315', aliases: ['MVM 315', '315 هاچبک'], startYear: 1391, endYear: 1400 },
    { name: 'ام‌وی‌ام X33', aliases: ['MVM X33', 'X33s'], startYear: 1389, endYear: 1401 },
    { name: 'ام‌وی‌ام 110', aliases: ['MVM 110', '110 سه سیلندر', '110 چهار سیلندر'], startYear: 1384, endYear: 1395 },
    { name: 'برلیانس H330', aliases: ['H330 اتوماتیک'], startYear: 1394, endYear: 1400 },
    { name: 'برلیانس H230', aliases: ['H230 دنده‌ای'], startYear: 1394, endYear: 1399 },
    { name: 'دانگ فنگ H30 کراس', aliases: ['H30 Cross', 'اتچ ۳۰ کراس'], startYear: 1395, endYear: 1398 },
    { name: 'چنگان CS35', aliases: ['Changan CS35'], startYear: 1395, endYear: 1398 },
    { name: 'سوزوکی گراند ویتارا', aliases: ['ویتارا 2000', 'ویتارا 2400'], startYear: 1386, endYear: 1398 },
    { name: 'مزدا 3', aliases: ['مزدا 3 قدیم'], startYear: 1386, endYear: 1389 },
    { name: 'مزدا 3 نیو', aliases: ['Mazda 3 New'], startYear: 1389, endYear: 1398 },
    { name: 'هیوندای ورنا', aliases: ['ورنا دنده‌ای', 'ورنا اتومات'], startYear: 1383, endYear: 1390 },
    { name: 'هیوندای آوانته', aliases: ['آوانته دنده‌ای', 'آوانته اتومات'], startYear: 1384, endYear: 1391 },
    { name: 'هیوندای اکسنت', aliases: ['Accent'], startYear: 1393, endYear: 1397 },
    { name: 'هیوندای سانتافه', aliases: ['سانتافه 2700', 'سانتافه ix45'], startYear: 1386, endYear: 1397 },
    { name: 'هیوندای سوناتا', aliases: ['سوناتا NF', 'سوناتا YF'], startYear: 1385, endYear: 1396 },
    { name: 'کیا سراتو', aliases: ['سراتو مونتاژ', 'سراتو سایپایی'], startYear: 1393, endYear: 1398 },
    { name: 'کیا اپتیما', aliases: ['Optima'], startYear: 1388, endYear: 1397 },
    { name: 'کیا اسپورتیج', aliases: ['Sportage'], startYear: 1387, endYear: 1397 },
    { name: 'تویوتا کرولا', aliases: ['Corolla'], startYear: 1384, endYear: 1396 },
    { name: 'تویوتا کمری', aliases: ['Camry XV40'], startYear: 1386, endYear: 1390 },
    { name: 'نیو پی‌کی', aliases: ['New PK', 'پی کی'], startYear: 1385, endYear: 1387 },
    { name: 'رنو سپند', aliases: ['سپند 2'], startYear: 1378, endYear: 1383 },
    { name: 'پکان بنزینی', aliases: ['پیکان معمولی', 'پیکان کاربریتور'], startYear: 1348, endYear: 1383 },
    { name: 'پیکان انژکتوری', aliases: ['پیکان انژکتور'], startYear: 1380, endYear: 1384 },
    { name: 'پیکان وانت', aliases: ['وانت باردو', 'پیکان باربری'], startYear: 1368, endYear: 1393 },
    { name: 'وانت آریسان', aliases: ['آریسان 1'], startYear: 1393, endYear: 1399 },
    { name: 'وانت آریسان 2', aliases: ['آریسان ۲ موتور XU7P'], startYear: 1401, endYear: 1403 },
    { name: 'وانت زامیاد بنزینی', aliases: ['نیسان آبی', 'نیسان زامیاد'], startYear: 1365, endYear: 1403 },
    { name: 'وانت زامیاد دیزل', aliases: ['نیسان دیزل'], startYear: 1388, endYear: 1400 },
    { name: 'وانت زامیاد دوگانه سوز', aliases: ['نیسان دوگانه'], startYear: 1385, endYear: 1403 },
    { name: 'پادرا', aliases: ['پادرا معمولی'], startYear: 1396, endYear: 1400 },
    { name: 'پادرا پلاس', aliases: ['پادرا پلاس دوکابین'], startYear: 1400, endYear: 1403 },
    { name: 'وانت کارا 1.7', aliases: ['مزدا کارا 1700'], startYear: 1393, endYear: 1398 },
    { name: 'وانت کارا 2.0', aliases: ['مزدا کارا 2000'], startYear: 1393, endYear: 1402 },
    { name: 'وانت کاپرا', aliases: ['کاپرا 2'], startYear: 1389, endYear: 1403 },
    { name: 'فردا T5', aliases: ['FMC T5'], startYear: 1400, endYear: 1403 },
    { name: 'دیگنیتی', aliases: ['Dignity Prime'], startYear: 1400, endYear: 1403 },
    { name: 'فیدلیتی', aliases: ['Fidelity Prime'], startYear: 1400, endYear: 1403 },
    { name: 'تارا دنده‌ای', aliases: ['تارا V1'], startYear: 1400, endYear: 1403 },
    { name: 'تارا اتوماتیک', aliases: ['تارا V2', 'تارا V4'], startYear: 1401, endYear: 1403 },
    { name: 'ریرا', aliases: ['Reera'], startYear: 1402, endYear: 1403 },
    { name: 'اتلس', aliases: ['Atlas'], startYear: 1402, endYear: 1403 },
    { name: 'سهند', aliases: ['Sahand'], startYear: 1402, endYear: 1403 }
  ];

  for (const v of vehicles) {
    await prisma.vehicleModel.upsert({
      where: {
        name_startYear_endYear: {
          name: v.name,
          startYear: v.startYear,
          endYear: v.endYear,
        },
      },
      update: { aliases: v.aliases },
      create: {
        name: v.name,
        aliases: v.aliases,
        startYear: v.startYear,
        endYear: v.endYear,
      },
    });
  }
  console.log(`✅ ${vehicles.length} Vehicle Models seeded.`);

  // 3. SEED PART CATALOG
  const parts = [
    { name: 'لنت ترمز جلو', aliases: ['لنت جلو', 'لنت جلویی', 'لنت چرخ جلو'] },
    { name: 'لنت ترمز عقب', aliases: ['لنت عقب', 'لنت عقبی', 'لنت چرخ عقب'] },
    { name: 'دیسک ترمز', aliases: ['دیسک چرخ', 'دیسک ترمز جلو', 'دیسک ترمز عقب'] },
    { name: 'صفحه کلاچ', aliases: ['صفحه کلچ', 'صفحه تک'] },
    { name: 'دیسک و صفحه', aliases: ['کیت کلاچ', 'دیسک و صفحه کلاچ', 'کیت کامل کلاچ'] },
    { name: 'بلبرینگ کلاچ', aliases: ['بلبرینگ کلچ'] },
    { name: 'بلبرینگ چرخ جلو', aliases: ['بلبرینگ جلو', 'بلبرینگ چرخ'] },
    { name: 'بلبرینگ چرخ عقب', aliases: ['بلبرینگ عقب'] },
    { name: 'کمک فنر جلو', aliases: ['کمک جلو', 'کمک فنر جلویی'] },
    { name: 'کمک فنر عقب', aliases: ['کمک عقب', 'کمک فنر عقبی'] },
    { name: 'فیلتر روغن', aliases: ['صافی روغن'] },
    { name: 'فیلتر هوا', aliases: ['صافی هوا', 'فیلتر هوا موتور'] },
    { name: 'فیلتر بنزین', aliases: ['صافی بنزین', 'فیلتر سوخت'] },
    { name: 'فیلتر اتاق', aliases: ['فیلتر کولر', 'فیلتر تهویه'] },
    { name: 'شمع موتور', aliases: ['شمع', 'شمع سوزنی', 'شمع پایه کوتاه', 'شمع پایه بلند'] },
    { name: 'کوئل', aliases: ['کوئل دوبل', 'کوئل منفرد', 'کویل'] },
    { name: 'وایرر شمع', aliases: ['وایرر', 'وایرر برق'] },
    { name: 'تسمه تایم', aliases: ['تسمه تایمینگ', 'تسمه تایم موتور'] },
    { name: 'تسمه دینام', aliases: ['تسمه شیاردار', 'تسمه کولر'] },
    { name: 'واتر پمپ', aliases: ['پمپ آب موتور', 'واترپمپ'] },
    { name: 'پمپ بنزین', aliases: ['پمپ سوخت', 'مغزی پمپ بنزین', 'مجموعه پمپ بنزین'] },
    { name: 'چراغ جلو چپ', aliases: ['چراغ جلو سمت راننده', 'چراغ سمت چپ'] },
    { name: 'چراغ جلو راست', aliases: ['چراغ جلو سمت شاگرد', 'چراغ سمت راست'] },
    { name: 'چراغ عقب چپ', aliases: ['خطر عقب چپ', 'چراغ خطر چپ'] },
    { name: 'چراغ عقب راست', aliases: ['خطر عقب راست', 'چراغ خطر راست'] },
    { name: 'آینه جانبی چپ', aliases: ['آینه سمت راننده', 'آینه چپ'] },
    { name: 'آینه جانبی راست', aliases: ['آینه سمت شاگرد', 'آینه راست'] },
    { name: 'سیبک فرمان', aliases: ['سیبک قرقری', 'چپقی فرمان'] },
    { name: 'سیبک طبق', aliases: ['سیبک زیر اکسل'] },
    { name: 'طبق جلو', aliases: ['طبق تک', 'طبق کامل'] },
    { name: 'گردگیر پلوس', aliases: ['گردگیر سمت چرخ', 'گردگیر سمت گیربکس'] },
    { name: 'گردگیر جعبه فرمان', aliases: ['گردگیر فرمان'] },
    { name: 'سرپلوس', aliases: ['سر پلوس', 'سرپلوس چرخ'] },
    { name: 'مشعل پلوس', aliases: ['مشعلی پلوس', 'سه شاخ پلوس'] },
    { name: 'ترموستات', aliases: ['ترموستات آب'] },
    { name: 'رادیاتور آب', aliases: ['رادیاتور موتور'] },
    { name: 'رادیاتور کولر', aliases: ['کندانسور کولر'] },
    { name: 'موتور فن', aliases: ['پروانه فن', 'موتور فن رادیاتور'] },
    { name: 'سنسور اکسیژن', aliases: ['سنسور اکسیژن بالا', 'سنسور اکسیژن پایین'] },
    { name: 'سنسور میل سوپاپ', aliases: ['سنسور موقعیت میل سوپاپ'] },
    { name: 'سنسور دور موتور', aliases: ['سنسور دورموتور', 'سنسور دور RPM'] },
    { name: 'سنسور کیلومتر', aliases: ['سنسور سرعت'] },
    { name: 'استپر موتور', aliases: ['استپر', 'استپر گاز'] },
    { name: 'واشر سرسیلندر', aliases: ['واشر سر سیلندر', 'واشر نسوز'] },
    { name: 'سوپاپ دود و هوا', aliases: ['دست کامل سوپاپ', 'سوپاپ موتور'] },
    { name: 'رینگ پیستون', aliases: ['رینگ موتور'] },
    { name: 'پیستون', aliases: ['دست پیستون'] },
    { name: 'یاتاقان ثابت و متحرک', aliases: ['دست کامل یاتاقان', 'یاتاقان استاندارد'] },
    { name: 'پمپ کلاچ بالا', aliases: ['پمپ کلچ بالا'] },
    { name: 'پمپ کلاچ پایین', aliases: ['پمپ کلچ پایین'] },
    { name: 'بوستر ترمز', aliases: ['بوستر کامل ترمز'] },
    { name: 'پمپ ترمز', aliases: ['مجموعه پمپ ترمز'] }
  ];

  for (const p of parts) {
    await prisma.partCatalog.upsert({
      where: { name: p.name },
      update: { aliases: p.aliases },
      create: { name: p.name, aliases: p.aliases, unit: 'عدد' },
    });
  }
  console.log(`✅ ${parts.length} Part Catalog items seeded.`);

  console.log('🎉 Seed execution completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed execution failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
