# Next Task — Warehouse OS

**As of:** 2026-07-30 · Read `docs/AI_HANDOFF.md` first.

## CURRENT DIRECTION (2026-08-03): فروش + اپ ویندوز فروشنده

جهت پروژه عوض شد. تصمیم‌های قطعی‌شده با کاربر:

- **حسابداری نوشته نمی‌شود.** مشتری از نرم‌افزار پارسیان استفاده می‌کند؛ اتصال زنده هم
  فعلاً نه. به‌جایش پایان هر روز، بعد از بک‌آپ، خروجی اکسل با **قالب قابل تغییر** تولید
  می‌شود (قالب «داده» است نه «کد»، تا تغییر ستون‌ها کدنویسی نخواهد).
- **اپ فروشنده = همان `apps/web` داخل قاب Tauri**، نه اپ جدا. تنها دلیل واقعی دسکتاپ
  بودن، دسترسی به فیش‌پرینتر ESC/POS است.
- **کارتخوان بانکی وصل نمی‌شود** — پروتکل بسته است و به مجوز/SDK بانک نیاز دارد.
  فقط نوع پرداخت (نقد/کارت/چک/نسیه) ثبت می‌شود.
- **امانی فعلاً نه** (کاربر پذیرفت که مهاجرت بعدی گران است).
- **رنگ اصلی آبی `#2563EB` قفل شد.** واحد پول **تومان**.
- سیستم طراحی مشترک: `docs/DESIGN_SYSTEM.md`
- پرامپت‌های واگذاری به مدل‌های دیگر: `docs/AI_TASK_PROMPTS.md`

### فازها
0. **انبارگردانی ۳۳ هزار قلم** — پیش‌نیاز قطعی فروش، کار انسانی، موازی با بقیه.
1. ~~قاب Tauri~~ — **کد نوشته شد** (`apps/desktop`)، ولی روی ویندوز کامپایل نشده.
2. ~~پل فیش‌پرینتر~~ — winspool RAW پیاده شد، همان‌جا. نیاز به تست روی سخت‌افزار واقعی.
3. صفحه‌ی POS کیبوردی
4. ~~سرویس فاکتور~~ — **DONE 2026-08-03**
5. ورود کالا و لیبل (جریان پیوسته)
6. حساب مشتری + گزارش سود
7. خروجی اکسل با قالب قابل تغییر

### بدهی‌های شناخته‌شده
- **`ProductPrice` مشکوک است:** بعضی ردیف‌ها قیمت خرید > قیمت فروش دارند (نمونه:
  شیشه بالابر پراید، خرید ۳٬۷۰۰٬۰۰۰ / فروش ۱۸۰٬۰۰۰). احتمالاً بخشی ریال و بخشی تومان
  وارد شده. **پیش از اتکا به گزارش سود باید پاک‌سازی شود.**
- `users.service.spec.ts` از قبل خراب است (PrismaService را به ماژول تست نمی‌دهد).

---

## جهت قبلی (2026-07-30): UI/UX polish + scope freeze

Priority pivoted to making the product **usable and testable**, not adding features:
1. **Android app UI/UX + performance** — polish the primary warehouse-worker flow
   (Login → Start Shift → Scan → Speak → interpreted result → Confirm → success →
   straight to next item). Fast, clear, large touch targets, clear feedback, good
   loading/empty/error/success states.
2. **Web Admin panel UI/UX** — complete/polish existing views (dashboard, warehouses,
   locations, products, inventory, **review/pending ops**, users, sessions): loading/
   empty/error states, tables, filters, search, pagination, confirm dialogs, approve/
   reject, product override. Make it feel production-ready.
3. **Design-system consistency** — Android and Web should feel like one product
   (colors, typography, spacing, status indicators, buttons, cards, forms, terminology).

**Acceptance:** a worker can Login → Start Shift → Scan → Speak → see result → Confirm →
clear success → continue, smoothly; the admin panel feels complete for managing/reviewing.

### Scope freeze — DO NOT implement now
Advanced Voice Counting, Count→Outbox, photo capture/upload/sync/storage/retrieval,
photo confirmation flow, `UserWarehouse` authorization, JWT redesign, new backend
architecture, speculative features. Only ensure the architecture doesn't *block* these later.

---

## اپ اندروید — به‌روزرسانی لازم دارد (۱۴۰۵/۰۵/۱۲)

بک‌اند جلو افتاده و اپ کارگر عقب مانده. سه چیز:

1. **کار برداشت** — `pick-tasks` ساخته و تست شده، ولی اپ اصلاً صدایش نمی‌زند.
   یعنی فروشنده لوکیشن را می‌فرستد و هیچ‌وقت روی گوشی کارگر ظاهر نمی‌شود.
2. **صفحهٔ «کارهای من»** — کارگر نمی‌بیند چه ثبت کرده، مدیر چه چیزی را تأیید یا
   **رد** کرده و چرا. بدون بازخوردِ رد شدن، همان اشتباه تکرار می‌شود.
3. **تأیید خودکار خاموش شد** — اپ باید همیشه فهرست پیشنهاد را نشان بدهد و
   مسیر «تأیید بی‌سؤال» را فرض نکند.

---

## Deferred / future work (record, do not implement now)

1. **Advanced Voice Counting Engine** (Android) — count-specific voice workflow, conversational counting, confirmation logic.
2. **Count flow → Outbox convergence** — route the count flow through the offline outbox (currently only voice stock-in is offline-first).
3. **Photo capture** (Android) — `ImageCapture` composable, preview/retake/use, on-device compression.
4. **Photo upload** — two-phase op→photo sync, multipart client, `OutboxPhoto` Room table + DAO.
5. **Photo synchronization** — WorkManager phase-2 drain, retry, local-file cleanup.
6. **Photo storage/retrieval UI** — "Add a photo?" flow (Android); [View photo] preview (web review).
   - *Backend groundwork already exists and is FROZEN* (commit `113a891`): `Asset` schema, upload/retrieve
     endpoints, approve re-link. Do not expand it; it compiles and is tested but has no client UI.
7. **Warehouse-scoped photo authorization** — needs a `UserWarehouse` model + `warehouseIds` in the JWT
     (applies to the existing unscoped review queue too). Retrieval is currently authenticated + role-gated only.
8. ~~**Proper Prisma migration baseline for production**~~ — **DONE 2026-08-03.**
     `20260803090000_baseline_catchup` captures the drifted state (`PendingOperation`, `Asset` photo
     columns, `ProductCreationRequest`, `Location.path/depth`, `Role.SALES`, `InventoryLog.unitPrice`,
     `PrintJob*`, `pg_trgm`, …) and was marked applied on dev via `migrate resolve` — no SQL ran against
     the seeded data. **Verified:** replaying the full history onto an empty DB yields a schema identical
     to `schema.prisma` (`migrate diff` = empty), and `migrate dev` no longer offers a reset.
     Two fixes were needed in the generated SQL: `CREATE EXTENSION IF NOT EXISTS pg_trgm` (Prisma does not
     manage extensions) and stripping `ASC` from the `Product.searchTokens` GIN index (invalid in Postgres).
     The rule still stands: **never `migrate reset` the dev DB** (63k locations, 33.5k products).
9. **Product-matching refinements — DEFERRED to AFTER the 10k import (user decision):**
   - Fold trigram `similarity` into the confidence % (today it's flag-based → correct matches cluster at 85%;
     ranking #1 is correct but the number is coarse).
   - Build a real regression corpus (`spoken phrase → expected SKU`) + an `alias/mishearing` list for the
     spell-correction dictionary. Run it against `/inventory/voice/preview`.
   - At ~100k products add a **GiST** trigram index for index-ordered KNN (`similarity()` currently seq-scans;
     fine ≤10k).

---

## IMPORT READINESS — get the 10k data right (this is the real matcher lever)

The matcher is now solid on real data (5/5 realistic phrases rank #1). Its accuracy at 10k depends on the
**data**, not more tuning. Before/at import (`/admin/imports`, Excel):
- **Unique `sku` per row**, dedupe. Product `name` should read like the worker speaks it (part first).
- **Consistent brand + vehicle names**, and populate **aliases** — especially common **STT mishearings**
  and family/trim spellings (e.g. «ال 90 / ال۹۰ / L90 / تندر 90») so `findVehicleModelIdsByName`'s
  family-prefix expansion resolves them.
- **Populate `partCatalog`** with real part types (+ aliases) — the spell-corrector snaps misheard tokens
  to it *before* matching; it's only as good as this vocabulary.
- Voice UX is **shortlist-and-tap** (needSelection), not perfect auto-confirm — design/data around that.

---

## ~~CRITICAL follow-up: kill the package-manager / Prisma-generate landmine~~ — DONE 2026-07-30

Both landmines are **fixed**; the monorepo is now single-manager **npm**. What was done
(see `AI_HANDOFF.md §4` for the full write-up + verification):
- Deleted `bun.lock` (root) + `apps/web/bun.lock`; only `package-lock.json` remains.
- Pinned `"packageManager": "npm@11.16.0"` in root `package.json`.
- Added `"prisma": { "schema": "apps/api/prisma/schema.prisma" }` to root `package.json`
  → every `prisma generate`, **including the `@prisma/client` postinstall**, uses the api
  schema. This kills the "regenerate from stale root schema" bug without deleting anything.
- Web `start`: `bun …` → `node …`.

**Verified:** wiped all `node_modules`, ran `npm install` **twice**; each time the generated
client has `PendingOperation` and backend + web `tsc` = 0 errors; no `bun.lock` regenerated.
`npm install` at root is now safe.

**Optional leftover cleanup (low priority):** the root `prisma/` dir still holds legacy
files (`schema.prisma`, `bu89.prisma`, `schema90.prisma`, `*.backup.prisma`, old `seed*.ts`).
They're now irrelevant to generation (the `prisma.schema` field overrides resolution) but
could be deleted for tidiness. Verify nothing references them first.

### Guardrail (run after ANY dependency install, always)
```bash
npx prisma generate --schema=apps/api/prisma/schema.prisma
```
Then `tsc -p apps/api/tsconfig.json --noEmit` must be 0 errors.

---

## Smaller follow-ups (after the two above)
- **`committedLogId`:** have `approve()` capture the created `InventoryLog.id` from
  `execute()` and store it on the pending op (currently null).
- **Reset dev-DB test pollution** (stock deltas from verification approvals) if a clean
  baseline is needed — see handoff §7.
- **Real-device test** of the Android outbox → sync → manager-approve loop end-to-end.
- Route the **count flow** through the outbox too (only voice stock-in is offline-first now).

---

## Guardrails for the next session
- **Use npm only** — Bun is gone. Do not reintroduce `bun install`/`bun.lock` (a stray
  `bun.lock` reappearing means someone ran Bun; delete it).
- `npm install` at root is now safe (Prisma auto-generates from the api schema via the root
  `prisma.schema` field). If in doubt, `tsc -p apps/api/tsconfig.json --noEmit` should be 0.
- Dev servers were stopped during the npm migration. Restart per `AI_HANDOFF.md §0`.
- Test login: `admin` / `test1234`.
