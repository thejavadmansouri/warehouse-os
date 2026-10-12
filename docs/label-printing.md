# چاپ لیبل حرارتی در کاردو — مرجع فنی

منبع‌ها: دفترچهٔ TSC TSPL/TSPL2، دیتاشیت TTP-244 Pro،
[thermal-label/tspl-core](https://github.com/thermal-label/tspl-core)،
[ceedadev/tspl-generator](https://github.com/ceedadev/tspl-generator)،
StackOverflow دربارهٔ چندستون TSPL، و فایل اثبات‌شدهٔ دسکتاپ
`100200_big.pdf` / `100200_label_tools/build_100200.js`.

## دو مسیر چاپ (باید جدا بمانند)

| مسیر | چی می‌فرستد | کی درست کار می‌کند |
|------|-------------|---------------------|
| **RAW / TSPL** | بایت دستور با datatype=`RAW` | **اپ ویندوزی:** Tauri → winspool محلی. **مرورگر:** API → winspool سرور یا TCP:9100 |
| **PDF واقعی** | فایل PDF با `MediaBox` = عرض رول × ارتفاع برچسب | درایور ویندوز TSC؛ Scale=۱۰۰٪، بدون Fit-to-page |

تنظیمات پرینتر: `LabelSettings.printerName` / `printerHost` / `printerPort`
(+ در اپ فروشنده `label_printer_name`). فهرست: `GET /labels/printers`.

HTML با پسوند `.pdf` PDF نیست. مرورگر/Adobe اندازه‌اش را عوض می‌کند و
خروجی با `100200_big` یکی نمی‌شود. مسیر درست رول قفسه: **PDF واقعی** یا **TSPL خام**.

## مدل فیزیکی رول

- رول مغازه ≈ ۱۰ سانتی؛ در فایل موفق صفحه **۱۰۴mm × ۲۵mm** بود (نه دقیقاً ۱۰۰).
- TTP-244 Pro: media تا ۱۱۲mm، عرض چاپ تا **۱۰۸mm**، **۲۰۳ DPI** → `1 mm = 8 dots`.
- پیش‌فرض کارخانهٔ درایور اغلب Media Width **۴ اینچ (۱۰۱.۶mm)** است — بعد از عوض‌کردن رول باید کالیبره شود.

### دستورهای کلیدی TSPL

```
SIZE <عرض_کل_تکه> mm,<ارتفاع_برچسب> mm
GAP <فاصله_بین_برچسب‌ها> mm,0 mm
DIRECTION 0|1
CLS
… محتوا با مختصات مطلق (نقطه) …
PRINT 1,1
```

- **SIZE width** = عرض کل ناحیه‌ای که در یک feed چاپ می‌شود (مثلاً ۱۰۴mm برای ۳ برچسب کنار هم)، نه عرض یک استیکر تنها.
- **ستون در TSPL وجود ندارد**: چند ستون = تکرار المان با `x`های مختلف (`slot * cellWidthDots`).
- **GAP 0,0** = رول پیوسته؛ برای die-cut معمولاً `GAP 2 mm,0 mm`.
- بعد از عوض‌کردن رول: `GAPDETECT` / Auto Calibration در منوی پرینتر یا درایور.

## هندسهٔ اثبات‌شدهٔ `100200_big`

از `build_100200.js`:

- صفحه: **۱۰۴ × ۲۵ mm**
- ستون: **۳** → عرض هر سلول = `104/3 ≈ 34.67 mm`
- QR ≈ **۱۹ mm**؛ حاشیه **۲.۲ mm**؛ فاصلهٔ QR تا عدد **۲ mm**
- فونت عدد: Helvetica-Bold، اندازه از عرض فضای راست سلول

پس برای قفسه: `cellW = mediaW / cols` (تقسیم مساوی)، نه چسباندن چند سلول با عرض ثابت که وسط رول خالی بماند.

## پیش‌تنظیمات برچسب روی رول ۱۰۴mm

| برچسب (تقریبی) | ستون | کاربرد |
|----------------|------|--------|
| ~۳۵ × ۲۵ (۳تایی) | ۳ | مثل ۱۰۰۲۰۰ |
| ۳۰ × ۲۰ | ۳ | کوچک‌تر |
| ۲۰ × ۳۰ | ۵ | باریک ایستاده |
| ۵۰ × ۳۰ | ۲ | لیبل کالا رایج |
| ۱۰۴ × ۳۰ | ۱ | تمام‌عرض |

کاربر فقط اندازهٔ برچسب را انتخاب می‌کند؛ عرض رول ثابت است.

## پرینتر ویندوز (TTP-244 Pro)

1. رول را بگذار؛ راهنمای عرض را بچسبان.
2. Sensor = **Gap** (die-cut).
3. Auto/Manual Calibration بعد از هر عوض‌کردن رول.
4. برای PDF: Paper size سفارشی = همان `mediaW × heightMm`؛ Scale **۱۰۰٪**؛ بدون «Fit to page».
5. برای TSPL خام: datatype=`RAW` (مثل `deploy/windows/updates/raw-label-test.ps1`).

## کتابخانه‌های مفید (مرجع، نه وابستگی اجباری)

- `thermal-label/tspl-core` — انکودر BITMAP / SIZE / GAP هم‌راستا با دفترچه
- `ceedadev/tspl-generator` — TEXT / BARCODE / QRCODE سطح بالا
- `Yenovi-Org/label-printer` — WebUSB / TCP:9100
- چاپ از مرورگر بدون پل دسکتاپ برای RAW عملاً پایدار نیست → کاردو از اپ فروشنده استفاده می‌کند

## وضعیت کاردو

- TSPL قفسه/کالا: `apps/web/src/lib/tspl.ts` + چاپ خام دسکتاپ
- HTML رول (legacy): `buildRollLocationHtml` — فقط پیش‌نمایش
- PDF واقعی رول قفسه: `roll-location-pdf.ts` (MediaBox میلی‌متری مثل 100200)
- تنظیمات UI: فقط preset اندازهٔ برچسب؛ `mediaWidthMm` = ۱۰۴
- چاپ کامل / انتخابی موقعیت: `GET /labels/location/:id/subtree` +
  `LocationPrintPicker` (صفحهٔ موقعیت‌ها و تب انبار/قفسه)
- چاپ کالای یک قفسه: تب انبار/قفسه → همه یا انتخابی (به تعداد موجودی)
