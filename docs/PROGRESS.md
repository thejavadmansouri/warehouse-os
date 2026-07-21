# وضعیت پیشرفت پروژه

## انجام‌شده (هسته اصلی کامل شد ✅)
- [x] معماری اولیه: NestJS + Prisma + PostgreSQL + Next.js + Android Kotlin
- [x] دیتابیس PostgreSQL نصب و راه‌اندازی شد (warehouse_os)
- [x] مدل درختی موقعیت‌ها: LocationType + Location (خودارجاع، با بارکد خودکار)
      کاربر خودش سطوح دلخواه (انبار/طبقه/راهرو/قفسه/ستون/سبد و...) را تعریف می‌کند
- [x] مدل Product (با name, sku, brand, compatibleVehicle) و InventoryLog
- [x] پارسر صوتی فارسی (src/lib/voice-parser.ts): نام کالا، برند (۲۳ برند
      شناخته‌شده)، خودرو سازگار، تعداد (فقط با واحد صریح: عدد/تا/جفت/دست/بسته)
- [x] endpoint اصلی: POST /inventory/voice-entry
      ورودی: {locationId, voiceText} → پارس صدا → پیدا/ساخت خودکار Product →
      ساخت InventoryLog. تست موفق end-to-end: "فیلتر روغن بوش 2 عدد" با موفقیت
      کالای جدید ساخت و به موجودی طبقه۱/انبار۳ اضافه کرد
- [x] endpoint های کامل: products, location-types, locations (+ path, +
      resolve/:barcode), inventory (+ by-location, + voice-entry)
- [x] تصمیم معماری: جریان اصلی ثبت کالا = اسکن بارکد موقعیت + اعلام صوتی
      کالاها (نه گفتن کل مسیر مکانی با صدا)
- [x] ۵۰ ردیف داده تست (JSON) آماده seed

## در حال انجام / بعدی
- [ ] endpoint چاپ برچسب (QR/بارکد تصویری) برای هر Location
- [ ] بهبود تشخیص تکراری بودن کالا (الان فقط بر اساس name+brand دقیق چک می‌شود)
- [ ] Authentication (JWT)
- [ ] طراحی UI وب با v0.dev (پرامپت آماده است)
- [ ] اسکلت اپ اندروید (Kotlin/Compose) - وصل به همین API

## اولویت پروژه
هسته انبارداری + ورودی صوتی (بخش درجه‌یک پروژه) اکنون end-to-end کار می‌کند.
از این به بعد می‌توان به موازات، سراغ UI و اندروید رفت.

## نکته برای ادامه با ابزار دیگر (ChatGPT/Gemini/غیره)
این فایل + PROJECT_RULES.md + prisma/schema.prisma را بدهید تا context کامل
پروژه را داشته باشد.
