# ادامه در سشن بعدی — دو کار مشخص

**تاریخ:** ۱۴۰۵/۰۵/۱۲ · وضعیت: بک‌اند هر دو آماده و تست‌شده؛ فقط UI مانده.

اپ اندروید روی همین مک با gradle بیلد و روی گوشی واقعی (Galaxy A12s،
`RZ8R72RT09X`) نصب می‌شود:

```bash
cd apps/android
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ./gradlew assembleDebug -q
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/prod/debug/app-prod-debug.apk
```

پکیج نصب‌شده: `com.warehouseos.operator.debug`.

الگوی کامل و تست‌شده برای صفحه‌ی جدید = «کارهای من» (کامیت `24cb02f`):
`ui/screens/mywork/` + `data/repository/MyWorkRepository.kt` +
`data/remote/dto/MyWorkDto.kt` + endpoint در `ApiService.kt` + route در
`Destinations.kt` + دکمه در `ShiftHomeScreen.kt` + composable در `OperatorNavGraph.kt`.

---

## ۱. صفحه‌ی «کار برداشت» روی گوشی کارگر  ← بالاترین اولویت

**بک‌اند کاملاً آماده و تست‌شده است** (کامیت‌های `57882cd`, `24cb02f`):
- `GET  /pick-tasks/mine`      — صف کارهای همین کارگر (کار بدون تخصیص + تخصیص‌داده‌شده به خودش)
- `POST /pick-tasks/:id/picked` — کارگر «آوردم/دیدم» زد (ادعای اتمیک؛ دو کارگر همزمان → فقط یکی)

هر آیتم برمی‌گرداند: `product.name`, `location.path`, `location.barcode`,
`quantity`, `status` (PENDING/PICKED/CANCELLED).

**UI که کاربر خواست، عیناً:**
- کارگر آدرس دقیق قفسه (`location.path`) + نام کالا + تعداد را می‌بیند.
- کنار هر آیتم یک **تیک** (چک‌باکس). وقتی کارگر آن قلم را دید/برداشت، تیک می‌زند
  → `POST /pick-tasks/:id/picked`.
- بعد از تیک، آیتم **کم‌رنگ می‌شود ولی پاک نمی‌شود** (alpha پایین، خط‌خورده یا رنگ محو).
  کارگر می‌رود سراغ قلم بعدی.
- ترتیب: PENDINGها بالا، PICKEDها کم‌رنگ پایین (یا همان جای خودشان با محو شدن).

**نکته:** اپ باید این صف را دوره‌ای بگیرد (WorkManager/polling روی LAN — نه FCM،
چون سرور on-prem است). مثل الگوی sync موجود.

**فایل‌ها:** `data/remote/dto/PickTaskDto.kt`, `data/repository/PickTaskRepository.kt`,
`ui/screens/picktasks/PickTasksScreen.kt` + ViewModel, route `PICK_TASKS` در
Destinations، دکمه در ShiftHome، composable در NavGraph، دو متد در ApiService.

**تست:** کاربر `worker` / رمز `worker1234` (در DB ست شده). الان ۱۰ کار PENDING
به این کارگر تخصیص داده شده و در `/pick-tasks/mine` برمی‌گردد. با gradle بیلد،
روی گوشی نصب، با `worker`/`worker1234` لاگین، شیفت را شروع کن، صفحه را باز کن.

---

## ۲. جست‌وجوی زنده‌ی کالا در صندوق فروش (`apps/web/src/app/admin/pos/`)

خواسته‌ی کاربر:
- جست‌وجو **لحظه‌ای/ajax** باشد — تایپ «سرسیلندر» همان لحظه نتایج را بیاورد،
  خیلی سریع‌تر از حالا. (الگوی موجود در `product-search.tsx`: debounce 300ms +
  react-query. باید سریع‌تر شود — debounce کمتر، یا نتایج instant.)
- هر نتیجه:
  - اگر **موجودی مثبت** دارد → یک **علامت سبز** + **آدرس قفسه** + دکمه‌ی
    **«ارسال به کارگر»** کنارش.
  - اگر **ناموجود** است → برچسب **«ناموجود»** (خاکستری).
- endpoint موجود: `GET /products/search?q=` (رنکر توکنی) و
  `GET /inventory/product/:id/stock` (مکان‌های موجودی مثبت). شاید بهتر باشد یک
  endpoint ترکیبی که هم محصول هم وضعیت موجودی را یک‌جا بدهد تا رفت‌وبرگشت کم شود.
- «ارسال به کارگر» از همین نتیجه = ساخت pick-task با انتخابگر کارگر (کامپوننت
  `worker-picker.tsx` که ساخته شده).

---

## داده‌ی تست فعلی (پاک‌نشده)

- کاربر کارگر: `worker` / `worker1234` (STAFF، نام: testwork)
- ۱۰ کار برداشت PENDING تخصیص‌یافته به این کارگر (کالاها در قفسه‌های
  «راهرو A قفسه ۱/۲»، «راهرو B قفسه ۵» زیر انبار TEST-PERF).
- چند لوکیشن و موجودی و قیمت نمایشی. **قبل از تحویل نهایی باید پاک شوند** —
  الگوی پاک‌سازی در کامیت‌های قبلی هست (به ترتیب وابستگی FK).

## نکات پایدار

- هر تغییر در matcher → `apps/api/test/voice/benchmark.py` را قبل/بعد اجرا کن.
- تأیید خودکار صوتی **خاموش** است (`AUTO_CONFIRM_ENABLED=false`) چون دقتش ۷۱٪ بود.
- واحد پول **تومان**. رنگ اصلی `#2563EB`. سیستم طراحی: `docs/DESIGN_SYSTEM.md`.
- ویندوز: کاربر در حال راه‌اندازی سرور on-prem است (Postgres + Node نصب شد،
  در حال ساخت `.env` و `npm install`).
