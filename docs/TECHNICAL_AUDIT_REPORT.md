# گزارش بازبینی فنی و ظاهری پروژه (Audit)

تاریخ: ۱۴۰۵/۰۶/۰۶ — ۲۰۲۶-۰۸-۲۸
شاخه: `feat/android-operator-epic0`
روش: فقط-خواندنی. هیچ فایل کدی تغییر نکرده است؛ typecheck/lint/test با `--noEmit` و بدون `--fix` اجرا شدند.

> **محدوده‌ی اصلی: کاردو** = `apps/web` + `apps/api` (+ `storefront`). بخش ۲-الف فقط همین‌هاست.
> `apps/vpnwatch` اپ جانبیِ الکترونیِ جدا از محصول است و در انتهای گزارش (بخش ۲-ب) آورده شده — از این به بعد بررسی نمی‌شود مگر به درخواست شما.

---

## ۲-الف. باگ‌های کاردو (وب + API) — اصلی

**فنی:**

- 🟠 **نوشتن/خواندن ref هنگام رندر در صندوق (React 19)** — `pos/_lib/carts.ts:155` مقدار `activeRef.current` را در بدنه‌ی رندر می‌نویسد؛ `pos/page.tsx:1474–1477` همان زنجیره را در رندر می‌خواند؛ `addCart/closeCart` هم `setActiveId` را **داخل updater** دیگری صدا می‌زنند. الگو عمدی است (هویت ثابت توابع) ولی در رندر دورریز/StrictMode می‌تواند به تبِ نامدولوم اشاره کند.
- 🟡 **`pos/page.tsx:376`** — `loadInvoice` درون effect قبل از تعریفش استفاده شده؛ الان سالم است ولی با جابه‌جایی کد TDZ می‌شود.
- 🟡 **`sms-templates/page.tsx:88–90`** — `dirty` از `saved.current` هنگام رندر خوانده می‌شود (درست بودنش به رندرِ ساخته‌شده توسط setState دیگر وابسته است).
- 🟡 **۵۷ خطای `set-state-in-effect` در ۴۶ فایل** — بدهی الگویی React، نه کرش.
- 🟡 **`main.ts:84`** — `bootstrap()` بدون catch؛ خطای `app.listen` کرشِ بی‌لاگ می‌شود.
- 🟡 **لبه‌ی `NO_AMOUNT_CHANGE`** در `corrections.service.ts` — اصلاحِ فقط-تعداد با مبلغ خالصِ صفر رد می‌شود با اینکه موجودی انبار واقعاً تغییر می‌کند (مسیر `addedLines` این را حل کرده، مسیر `lines` نه).
- 🟡 **`auth.service.ts:174`** — `require('bcrypt')` داخل تابع؛ به import بالای فایل منتقل شود.
- ⚪ بدهی type-safety: ~۱۱۰۰ مورد `unsafe-any` در lint API؛ ۶۱۱۵ خطای prettier (خودکار-رفع‌شونده)؛ ۴ `eslint-disable` بی‌استفاده در وب؛ `https-server.js` بدون type.
- ⚪ **دامپ دیتابیس `backup/warehouse_os_*.tar.gz` داخل ریپو و خارج از `.gitignore`** — قبل از هر add سراسری باید ignore شود.

**ظاهری:**

- ✅ **رفع شد — حالت مغازه**: `body` حالا `calc(15px * var(--ui-scale))` است؛ پایه‌ی ۱۵px در ۱۰۰٪ ثابت مانده. یک نقصِ مرتبط هم بسته شد: `@media print` حالا font-size را reset می‌کند تا برگه‌ی چاپی با بزرگ‌نمایی رابط بزرگ نشود.
- ✅ **رفع شد — نوار ردیف فعال در RTL**: `inset -3px` شد؛ نوار حالا به لبه‌ی آغازین (راست) می‌نشیند. در نگاه چشمی صفحه‌ی واقعی هم تأیید شود.
- ✅ **رفع شد — «نقدی گذری» لینک مرده**: بدون مشتری حالا `<span>` کم‌رنگ رندر می‌شود، نه دکمه؛ دکمه فقط وقتی است که مشتری واقعاً دارد و title هم گرفت.
- 🟡 **رگرسیون a11y در ریزگردش** — `statement-table.tsx` به‌جای `<Link>` از `onClick` روی `<tr>` استفاده می‌کند؛ با کیبورد (tabIndex/Enter) قابل بازکردن نیست.
- ⚪ `cart-tabs` — گوشه‌ی تبِ فعال (`rounded-t-lg`) با padding قابِ ظرف هم‌ترازِ کامل نیست (جزئی).

---

## ۲-ب. اپ جانبی vpnwatch (جدای محصول — در صورت نیاز)

### 🔴 B1 — بن‌بست خودکارِ بازیابی در کیلسوییچ

## ۱. نتیجه بررسی‌های خودکار

| بررسی | نتیجه |
|---|---|
| `tsc --noEmit` — وب | ✅ بدون خطا |
| `tsc --noEmit` — API | ✅ بدون خطا |
| Vitest — وب | ✅ ۱۴۴/۱۴۴ آزمون سبز (۱۸ فایل) |
| Jest — API | ✅ ۱۸۷/۱۸۷ آزمون سبز (۲۷ فایل) |
| ESLint — وب | ❌ ۷۹ مشکل (۷۲ خطا، ۷ هشدار) |
| ESLint — API | ❌ ۶۲۸۸ مشکل (۶۱۱۵ خطا — تقریباً همه prettier) |

### تفکیک خطاهای ESLint وب
- `react-hooks/set-state-in-effect` — **۵۷ مورد** در ۴۶ فایل (الگوی پرتکرار؛ setState همزمان داخل effect)
- `react-hooks/refs` — ۱۱ مورد: `pos/_lib/carts.ts:155`، `pos/page.tsx:1474–1477`، `sms-templates/page.tsx:88–90`
- `react-hooks/immutability` — ۱ مورد: `pos/page.tsx:376` (دسترسی به `loadInvoice` پیش از تعریف)
- `no-require-imports` — ۳ مورد در `https-server.js`
- `no-unused-expressions` — ۳ مورد: `labels:86`، `locations:472`، `product-images:780`
- ۴ راهنمای `eslint-disable` بی‌استفاده (checkout-flow:122، pos/page:381، product-form-dialog:346، barcode-svg:17)

### تفکیک ESLint API (غیر از prettier)
- بدهی type-safety: ۵۴۲ `no-unsafe-member-access`، ۳۷۳ `no-unsafe-assignment`، ۱۰۲ `no-unsafe-argument`، ۷۱ `no-unsafe-call`، ۳۴ `no-unsafe-return`
- `main.ts:84` — `bootstrap()` بدون await/catch (promis شناور)
- `auth.service.ts:174` — `require('bcrypt')` داخل تابع
- ۱۲ متغیر بلااستفاده، ۴ `require-await`، ۱۵ assertion غیرضروری
- `persian-normalize.ts:36` — فاصله‌ی نامنظم داخل کلاس کاراکتر **عمدی است** (تطبیق ZWNJ)؛ فقط یک `eslint-disable-line` لازم دارد، باگ نیست.

---

## ۲. باگ‌های واقعی فنی (به ترتیب اهمیت)

### 🔴 B1 — بن‌بست خودکارِ بازیابی در کیلسوییچ vpnwatch
`apps/vpnwatch/main.js` → `killSwitchIfNeeded` فقط در گذار `notAllowed → allowed` وای‌فای را وصل می‌کند. اما بعد از قطع‌شدن وای‌فای، `geo.check()` همیشه شکست می‌خورد → وضعیت برای همیشه `unknown` می‌ماند → گذار به `allowed` هرگز رخ نمی‌دهد. روی دستگاه‌های فقط-وای‌فای، اینترنت تا کلیک دستیِ «بازیابی اینترنت» برنمی‌گردد؛ حتی اگر VPN به کشور مجاز برگردد.
**رفع پیشنهادی:** گذار `notAllowed → unknown` را هم بعد از N تلاش ناموفق بازیابی کند، یا تایمر بازیابی جدا بگذارد.

### 🔴 B2 — ریسک ارتقای سطح دسترسی (sudoers روی مسیرِ متعلق به کاربر)
`setup-killswitch.sh` قانون `NOPASSWD` را به `~/Library/VpnWatch/scripts/vpnwatch-killswitch.sh` می‌دهد؛ این فایل متعلق به کاربر است و `installScripts()` در **هر اجرای برنامه** آن را بازنویسی می‌کند. هر بدافزارِ سطح کاربر می‌تواند اسکریپت را عوض کند و با `sudo -n` ریشه بگیرد.
**رفع پیشنهادی:** هلپر در مسیر root-owned (`/usr/local/sbin/…` یا `/Library/PrivilegedHelperTools`)، `chown root:wheel` در setup، و توقف بازنویسی‌هرباره در `installScripts` (یا استفاده از SMAppService).

### 🟠 B3 — `helperExists()` به‌جای false می‌تواند exception بدهد
`apps/vpnwatch/kill-switch.js` — `fs.accessSync(HELPER_PATH, X_OK) === undefined` در صورت نبودِ مجوز اجرا **پرتاب** می‌کند نه false؛ و `isConfigured()/trigger()` آن بیرون از try صدا می‌زنند → استثنای کنترل‌نشده در حلقه‌ی `checkNow` و شکست همان تیک مانیتورینگ.

### 🟠 B4 — کیلسوییچ فقط وای‌فای را می‌بندد
`vpnwatch-killswitch.sh` در نبود AirPort، اینترفیسِ default-route را می‌گیرد که ممکن است اترنت/دانگل باشد؛ `-setairportpower` روی آن بی‌اثر است → نشت ادامه می‌یابد. ترافیک اترنت اساساً پوشش داده نمی‌شود.

### 🟠 B5 — نوشتن/خواندن ref هنگام رندر در صندوق (React 19)
- `carts.ts:155`: `activeRef.current = current.id` در بدنه‌ی رندر — الگوی عمدی برای هویت ثابت توابع، ولی در رندرِ دورریز/StrictMode می‌تواند به تبِ نامدولوم اشاره کند.
- `addCart/closeCart`: فراخوانی `setActiveId` **داخل updater** دیگری — updater باید pure باشد؛ در StrictMode دوبار اجرا می‌شود (در عمل idempotent است، ولی شکننده).
- `pos/page.tsx:1474–1477` — همان زنجیره هنگام رندر ref می‌خواند.

### 🟡 B6 — حالت مغازه: متنِ ثابت با بزرگ‌نمایی مقیاس نمی‌گیرد
`globals.css` — `html { font-size: calc(16px * var(--ui-scale)) }` ولی `body { font-size: 15px }` ثابت است. کلاس‌های rem (مثل text-sm) بزرگ می‌شوند، اما متنِ بی‌کلاس و کنترل‌هایی که `font: inherit` می‌گیرند روی ۱۵px می‌مانند → در ۱۴۰–۱۶۰٪ ناهماهنگی بصری. کامنتِ «rem و em هر دو» با px ثابتِ body در تضاد است.

### 🟡 B7 — نوار ردیف فعال در سمت اشتباه RTL
`globals.css` → `[data-active-row="true"] { box-shadow: inset 3px 0 0 0 }` — سایه‌ی inset با آفست مثبت به لبه‌ی **چپ** می‌نشیند؛ در رابط راست‌چین باید `inset -3px 0 0 0` باشد (سمت راست/آغازین). نیازمند تأیید چشمی.

### 🟡 B8 — «نقدی گذری» ظاهرِ کلیک‌پذیر بدون عمل
`pos/_components/recent-invoices.tsx` — نام مشتری همیشه `<button>` با cursor/underline است؛ وقتی مشتری ندارد کلیک هیچ کاری نمی‌کند. باید برای null غیرفعال و بدون استایل لینک رندر شود.

### 🟡 B9 — رگرسیون a11y در ردیف‌های ریزگردش
`statement-table.tsx` — `<Link>` حذف و `onClick` روی `<tr>` گذاشته شد؛ بدون `tabIndex`/`role`/هندلر Enter، با کیبورد قابل دسترسی نیست (در اپی که کلید F/Enter محور است مهم است).

### 🟡 B10 — لبه‌ی منطقی در اصلاحیه (از قبل موجود)
`corrections.service.ts` — اگر اصلاحِ یک ردیفِ موجود فقط «تعداد» را عوض کند ولی مبلغِ خالص صفر شود (مثلاً تغییر قیمت جبرانش کند)، با `NO_AMOUNT_CHANGE` رد می‌شود با اینکه موجودی انبار واقعاً تغییر می‌کند. مسیر جدیدِ `addedLines` این را حل کرده ولی مسیر `lines` نه.

### 🟡 B11 — `bootstrap()` شناور در `main.ts:84`
اگر `app.listen` رد شود، خطا کنترل نمی‌شود؛ در نسخه‌های جدید Node کرش بی‌لاگ رخ می‌دهد. یک `.catch` با `logger.error + process.exit(1)` کافی است.

### ⚪ موارد جزئی
- `auth.service.ts:174`: `require('bcrypt')` داخل تابع — به import بالای فایل منتقل شود (هزینه‌ی lazy load هر بار لاگین).
- `https-server.js` (وب): ۳ `require` و بدون type — فایل ابزار است، از lint مستثنا شود یا به mjs تبدیل شود.
- `country-dialog.html` (vpnwatch): فونت انگلیسی برای UI فارسی؛ Vazirmatn اضافه شود.
- `package.json` vpnwatch: build فقط `--arch=x64` — روی مک‌های M سری تحت Rosetta اجرا می‌شود؛ `--arch=arm64` (یا universal) اضافه شود.
- `pos/page.tsx:376`: دسترسی به `loadInvoice` پیش از تعریف — در زمان اجرا سالم است (بستار)، ولی با جابه‌جایی کد TDZ می‌شود؛ انتقال effect به بعد از تعریف mutation تمیزتر است.
- `sms-templates/page.tsx:88–90`: خواندن `saved.current` هنگام رندر برای `dirty` — کار می‌کند چون setState دیگری رندر می‌سازد، ولی الگوی شکننده است.
- `backup/warehouse_os_*.dump.storage.tar.gz` — دامپ دیتابیس داخل پوشه‌ی ریپو و untracked است؛ در `.gitignore` نیست. **قبل از هر `git add` سراسری اضافه‌شدنش را ببندید** (`backup/` به .gitignore اضافه شود).
- فرمت‌دهی API: ۶۱۱۵ خطای prettier (تقریباً همه‌ی خودکار-رفع‌شونده) — نشانه‌ی اجرا نشدن `prettier` روی API؛ یک `npx prettier --write` یک‌باره + hook پیش‌کامیت.

---

## ۳. باگ‌های ظاهری/UX جمع‌بندی‌شده
1. ناهماهنگی مقیاس متن در «حالت مغازه» (B6).
2. نوار ردیف فعال سمت چپ به‌جای راست در RTL (B7 — نیازمند تأیید چشمی).
3. «نقدی گذری» با ظاهر لینکِ مرده (B8).
4. ردیف‌های ریزگردش با کیبورد باز نمی‌شوند (B9).
5. `cart-tabs` تب فعال با `rounded-t-lg` داخل ظرف `rounded-lg border p-1` — گوشه‌ی بالایی تب با قاب ظرف می‌سازد؛ بصری قابل قبول ولی در حالت اسکرول افقی، لبه‌ی پایینِ 2pxِ تب فعال با padding ظرف هم‌راستا نیست (جزئی).
6. در vpnwatch، دیالوگ کشور ارتفاع 190px دارد و روی مقیاس متن بزرگ‌تر macOS ممکن است برش بخورد (جزئی).

---

## ۴. نقاط قوت دیده‌شده
- اسکیمای Prisma و مایگریشن `correction_new_line` کاملاً سازگارند؛ `line-balance.ts` تعریف واحد و مستندِ «مانده» را بین اصلاحیه/مرجوعی یکسان کرده و آزمون دارد.
- نگهبان‌های `EMPTY_CORRECTION`، `ADD_LINE_FAILED` و فالبکِ مکان سیستمی درست پیاده شده‌اند.
- `persist` + اسکریپت boot برای ui-scale پرش بصری اولیه را حل کرده است.
- هیچ secretای در گیت نیست (`env`، `local.properties`، `.DS_Store` همگی untracked و ignore شده‌اند).

## ۵. ترتیب پیشنهادی رسیدگی
1. B1 و B2 (امنیت/ازدست‌رفتن اینترنت) — vpnwatch
2. B3، B4 — پایداری همان اپ
3. B7 و B8 — دو اصلاح چندخطیِ ظاهری
4. B6 — تصمیم طراحی: rem کردن body یا حذف px ثابت
5. B10 و B11 — API
6. یک بار `prettier --write` روی API + حذف disableهای بی‌استفاده
7. بدهی lint وب (set-state-in-effect) به‌مرور، صفحه‌به‌صفحه
