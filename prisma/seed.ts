import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 در حال وارد کردن داده‌های مرجع قطعات و خودروهای ایران...');

  // ۱. دسته‌بندی‌های انبار قطعات خودرو
  const categories = [
    { name: 'سیستم ترمز', code: 'BRAKE' },
    { name: 'قطعات موتوری', code: 'ENGINE' },
    { name: 'تعلیق و جلوبندی', code: 'SUSPENSION' },
    { name: 'برق و الکترونیک', code: 'ELECTRICAL' },
    { name: 'بدنه و تزئینات', code: 'BODY' },
    { name: 'روغنی و فیلترجات', code: 'CONSUMABLE' },
    { name: 'سیستم انتقال قدرت و گیربکس', code: 'TRANSMISSION' },
    { name: 'سیستم خنک‌کننده و تهویه', code: 'COOLING' },
    { name: 'سیستم سوخت‌رسانی و اگزوز', code: 'FUEL' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    });
  }

  // ۲. برندهای معتبر قطعات خودرو
  const brands = [
    'ایساکو', 'سایپا یدک', 'عظام', 'کروز', 'تکستار', 'دیناپارت', 'امکو', 'والئو',
    'بوش', 'سریک', 'گلد', 'پارس لنت', 'ایران کاربراتور', 'کاویان', 'جهان لنت',
    'ام‌جی‌پی', 'هرسول', 'رینگ اسپورت', 'ام‌آرپی', 'سانکس', 'سامفر', 'فناوری جدید'
  ];

  for (const name of brands) {
    await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // ۳. خودروها با سال تولید و مشخصه فنی دقیق
  const vehicles = [
    { name: 'پراید صبا', startYear: 1375, endYear: 1382, systemType: 'کاربراتوری' },
    { name: 'پراید صبا / 131', startYear: 1383, endYear: 1389, systemType: 'انژکتوری نیمه‌گاز/CLC' },
    { name: 'پراید 131', startYear: 1390, endYear: 1398, systemType: 'یورو 4 / ABS' },
    { name: 'پراید 111 (هاچبک)', startYear: 1389, endYear: 1399, systemType: 'ABS / یورو 4' },
    { name: 'پراید 132', startYear: 1387, endYear: 1398, systemType: 'داشبورد قدیم و جدید' },
    { name: 'پژو 405 GLX', startYear: 1377, endYear: 1383, systemType: 'کاربراتوری / 2000' },
    { name: 'پژو 405 GLX / SLX', startYear: 1384, endYear: 1392, systemType: 'موتور XU7 / داشبورد قدیم' },
    { name: 'پژو 405 GLX / SLX', startYear: 1393, endYear: 1399, systemType: 'داشبورد جدید سوناتایی / موتور TU5' },
    { name: 'پژو 206 تیپ 2/3', startYear: 1380, endYear: 1391, systemType: 'فرانسوی' },
    { name: 'پژو 206 تیپ 2/3', startYear: 1392, endYear: 1401, systemType: 'ایرانیزه / ECO-MUX' },
    { name: 'پژو 206 تیپ 5/6 (SD)', startYear: 1382, endYear: 1391, systemType: 'موتور TU5 فرانسوی' },
    { name: 'پژو 206 تیپ 5 (SD)', startYear: 1392, endYear: 1400, systemType: 'ایرانیزه / دریچه گاز سیمی' },
    { name: 'پژو 207i', startYear: 1395, endYear: 1403, systemType: 'موتور TU5 / سقف شیشه‌ای' },
    { name: 'پژو پارس معمولی / LX', startYear: 1379, endYear: 1392, systemType: 'موتور XU7' },
    { name: 'پژو پارس LX / XU7P', startYear: 1393, endYear: 1403, systemType: 'داشبورد جدید / XU7پلاس' },
    { name: 'سمند LX / SE', startYear: 1381, endYear: 1392, systemType: 'موتور XU7' },
    { name: 'سمند EF7', startYear: 1390, endYear: 1401, systemType: 'موتور ملی EF7' },
    { name: 'دنا / دنا پلاس', startYear: 1393, endYear: 1403, systemType: 'توربو شارژ / اتوماتیک' },
    { name: 'تیبا 1 / تیبا 2', startYear: 1389, endYear: 1401, systemType: 'موتور M15' },
    { name: 'کوییک R / S', startYear: 1397, endYear: 1403, systemType: 'موتور M15' },
    { name: 'شاهین G', startYear: 1399, endYear: 1403, systemType: 'موتور M15TC توربو' },
    { name: 'تندر 90 (L90)', startYear: 1386, endYear: 1398, systemType: 'موتور K4M' },
    { name: 'زانتیا 1800 / 2000', startYear: 1380, endYear: 1389, systemType: 'سیتروئن' },
  ];

  for (const v of vehicles) {
    await prisma.vehicleModel.upsert({
      where: { name_startYear_endYear: { name: v.name, startYear: v.startYear, endYear: v.endYear } },
      update: {},
      create: v,
    });
  }

  console.log('✅ بانک مرجع برندها، دسته‌بندی‌ها و خودروها بارگذاری شد!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
