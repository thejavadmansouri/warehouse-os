# Changelog

## v0.1

- Initial Project

---

## v0.2

- Voice Inventory MVP
- Barcode Scan
- Inventory Engine

---

## v0.3

- Warehouse Schema
- Supplier Foundation
- Product Pricing
- Transfer
- Inventory Logs
- Multi Location

---

## Unreleased

### SaleInvoice.total is now net of credit returns (2026-09-20)

- Bug: a credit return decremented `SaleInvoice.dueAmount` but never `total`,
  so every consumer of `total` — the payment-recompose dialog header, the
  invoice detail page, the list — showed a stale, inflated amount. Customer
  ۰۰۰'s invoice 69 displayed 40,000,000 for what was really a 20,000,000
  invoice after a return and a correction.
- Fix: `returns.service` now decrements `total` alongside `dueAmount` for
  CREDIT returns, guarded by `WHERE total >= amount` so the field can never
  go negative. CASH/CARD refunds still touch only `dueAmount` — the money
  went back over the counter, the payable amount is unchanged.
- Every display-side compensation was removed: `effectiveTotal` in
  payments-recompose, `total − returns` in findAll and adjustments.service,
  and `LedgerService.invoiceReturnTotals` itself. Leaving any of them in
  place would now double-subtract. `InvoiceEffectsService.deltaByInvoice`
  (statements/open-accounts) counts only CASH/CARD refunds, since CREDIT
  refunds now sit inside `total`.
- Migration `20260920120000_invoice_total_net_of_credit_returns` rewrites
  existing invoices' `total` from their own RETURN ledger rows once
  (`GREATEST(0, …)` guard), so the update kit fixes shipped data too.
  Verified against all 10 affected invoices before migrating: 0 display
  deltas between the old formula (`total − all returns`) and the new one
  (`total` minus CASH/CARD only).
- Regression tests lock the write rule (returns.service.spec: credit
  decrements both fields, cash writes nothing, over-refund floors at zero;
  invoice-effects.service.spec: the delta query excludes credit refunds).
  API jest 329/329, web vitest 252/252.

### The update kit now carries its own Prisma CLI (2026-09-16)

- Found during the pre-flash check of the kit: `apply-update.ps1` runs
  `prisma generate` and `prisma migrate deploy`, and `Find-PrismaCli` looked only
  at the install (`app\api\node_modules`), a global `prisma` command, and the
  dev-repo path. No Setup payload and no previous kit shipped the CLI, so on the
  shop both steps could not run — the migrations of this very kit were
  undeliverable, and the pre-update CHECK failed with "Prisma CLI not found".
- `tools/build-prisma-cli-kit.ps1` (new) builds a standalone closure
  (`prisma` + `@prisma/client` 6.19.3, download caches and sourcemaps pruned,
  proven with `--version` and a read-only `migrate status` before it is
  accepted) into `tools/prisma-cli-kit/node_modules` — gitignored npm output,
  168 MB.
- `build-update-kit.ps1` copies that closure into the kit as
  `api\node_modules` and says so; if the closure is missing the kit still builds
  but the gap is written into `kit-contents.txt` instead of hiding.
- `apply-update.ps1` — three changes: `Find-PrismaCli` also looks inside the kit
  (so the CHECK passes *before* any file is touched and the migration check can
  actually authenticate against the database); the kit's `api\node_modules` is
  **merged** into `app\api\node_modules`, never replaced (a wholesale replace
  would delete the installed `@prisma/client` the running API imports); and the
  two prisma steps lower `ErrorActionPreference` around the call, because the
  CLI writes its deprecation chatter to stderr and under EAP=Stop a redirected
  stderr line becomes a NativeCommandError that kills a successful command.
- Kit grew from 42 MB to 202 MB (6787 files) with the CLI inside; CHECK on the
  dev machine is now green end-to-end (CLI found in the kit, database
  authenticated, 0 pending migrations).

### Post-shop-update delta — **none of this is installed in the shop** (2026-09-15)

The last installer that exists is `WarehouseOS-Setup-0.4.0.exe` (2026-09-06), and the
last thing actually applied on the shop machine is the `seller-print-fix` package plus
`apply-update.ps1` / `run-update.bat` in `deploy/windows/updates/` (2026-09-07 → 09).
Everything below happened *after* that and has not been delivered anywhere.

Caveat on the evidence: this tree has **no git history** (see
`docs/ANDROID_READINESS.md` §3.3), so this list was reconstructed from file
modification times. It is complete for source files and proves nothing.
`deploy/windows/payload/app/desktop/warehouse-seller.exe` was rebuilt on 2026-09-08
but the tree holds no record of it being pushed to the shop.

#### Direct thermal label printing (2026-09-09)

- `deploy/windows/updates/gen-labels.cjs` — offline generator for the TSC TTP-244 Pro:
  SKUs harvested from a supplier PDF, names pulled from the app database, Persian names
  rasterised with sharp into `BITMAP` commands, 2-up on a 105 mm roll (two 51×32 mm
  die-cut labels), output `kardo-labels.prn` for the spooler. Built because the
  barcode/name layout had to be provable before committing it to the app.
- `deploy/windows/updates/print-test.cjs` — print smoke test for the same path.

#### POS cart tabs that survive a refresh (2026-09-11 → 12)

- `apps/web/src/app/admin/pos/_lib/carts-persist.ts` — the invoice tabs used to live
  only in React memory: they survived navigation but a full refresh (or a browser crash
  or a shop power cut) burned every half-finished invoice at exactly the moment the
  customer was standing at the counter. Now written to `localStorage`.
- Safety rules are the point, not the serialisation: versioned shape, a **compatible**
  old version is still read (a mid-sale cart must not be sacrificed to an update),
  reading never throws (corrupt JSON ⇒ empty cart, not a broken POS), writing never
  throws (quota/serialisation errors are swallowed — persistence must not compete with
  selling), and every restored shape is lightly validated so tampered data cannot reach
  state. Covered by `carts.test.ts`.

#### Payment recomposition — «اصلاح نحوهٔ پرداخت» (2026-09-12)

- `POST` route + `sales/payments-recompose.service.ts` (557 lines) + `dto/`. The real
  counter scenario: a 100m invoice was rung up entirely on card, then it turns out 30m
  was cash and 70m نسیه. Nothing accepted that before — a correction rejected a
  zero-total change, and settling a difference found no difference.
- It recomposes instead of recording a delta: per-method difference between the current
  and requested split ⇒ offsetting negative rows plus real positive rows, all still
  `Payment` rows so cash/card reports and صورتحساب totals are right with **no other code
  change**. One ledger row and one auto-voucher «قبل: … · بعد: …»; if only cash/card
  swapped (نسیه unchanged) no money moved and no voucher is written — an empty voucher
  only clutters the journal.
- `apps/api/src/sales/line-lock.ts` — `SELECT … FOR UPDATE` on the invoice. Two
  concurrent operations on the *same* invoice (two returns, two corrections, or one of
  each) each read the refundable cap from `lineBalances`; without the lock both can see
  the same remaining balance and both overshoot — e.g. 10 sold units returned twice.
  Locking the invoice serialises every race on its rows while stock keeps the project's
  fixed `inLockOrder`.
- `apps/api/src/common/tehran-day.ts` — the shop's day boundary. Timestamps are UTC but
  the shop is in Tehran and its working night ends at Tehran midnight, so "today" from
  UTC shows the night shift (20:30–24:00) its own 11 pm invoice as "yesterday". Iran has
  had no DST since 1401 and is always +3:30, so the conversion is exact and needs no
  timezone library. Also the rule that a cashier may only recompose *today's* invoices.
- New POS UI: `payment-recompose-dialog.tsx`, `open-accounts.tsx`,
  `customer-invoices.tsx`, plus `invoices/[id]/page.tsx` and three test files.

#### Journal labels, statements and live updates (2026-09-12)

- `apps/api/src/vouchers/labels.ts` — Persian labels for `FixedAccount` and
  `VoucherSourceType` (صندوق، چک‌های دریافتی، برگشت از فروش، …) for the manager's journal
  screen and the reconciliation report; `components/voucher-card.tsx` renders them.
- `admin/print/statement/[id]/page.tsx` + `customers/[id]/_components/statement-table.tsx`
  — printable customer statement (صورتحساب) built from the same ledger rows the invoice
  uses, so the two can never disagree.
- `apps/api/src/realtime/realtime.events.ts` + `apps/web/src/lib/use-live-events.ts` +
  `sales.controller.ts`/`sales.module.ts` — realtime contract. Golden rule, stated in the
  file: these events are **notifications, not payloads**. No price, cost or sensitive
  field goes over the socket — only what happened plus a few light ids, so the client
  refetches through the same guarded REST endpoint. That way the realtime channel can
  never become a role-scoped data leak.
- `admin/print/_components/invoice-sheet.tsx` — the printed invoice sheet.

#### Roll labels for shelf locations (2026-09-09 → 12)

- `apps/api/src/labels/{labels.controller.ts,labels.service.ts,label-template.ts}` +
  `admin/labels/page.tsx`, `components/labels/label-print-dialog.tsx`, `lib/api.ts` —
  location labels can now be printed as thermal **roll** output: each PDF page is one
  piece of the roll (`@page size: mediaWidth × height`) carrying
  `floor(mediaWidth / widthMm)` QR-first labels side by side, big QR (`height − 4` mm)
  with the location code in bold next to it. Why `@page` at the roll size: a thermal
  printer emits a page as one roll piece, so a PDF in any other size gets scaled or
  truncated by the driver — the same failure that used to put a tiny label in the middle
  of an A4 sheet.
- **The settings already express the 3-up layout**: media width 104 mm, label
  width 34 mm, height 25 mm ⇒ three 34×25 mm labels per piece with a ~21 mm QR. No code
  change is needed for that; note only that `widthMm` is rounded, so 35 gives 2-up while
  34 gives 3-up.
- `apps/web/src/lib/tspl.ts` — client-side TSPL builder for «چاپ مستقیم (حرارتی)» from
  inside the seller app, a faithful port of `apps/api/src/labels/tspl.service.ts` (same
  dimensions, layout and bitmap packing). It has to be client-side: the thermal printer
  is attached to the machine running the seller app, not to the API server. The web app
  only builds the commands and hands them to the desktop bridge, which writes them with
  `datatype=RAW` so the driver stays out of the way.

#### Android operator app (2026-09-12)

- Auth/session hardening on top of Epics 2–3, now covered by unit tests:
  `AuthRepository.kt` (login/logout/start routing that does **not** throw a valid session
  away just because the LAN server is unreachable), `SettingsStore.kt`, the encrypted
  token store, `LoginViewModel.kt` (Persian wording that separates wrong credentials from
  a dead LAN from a server error), `StartupViewModel.kt`, `RepositoryModule.kt`.
- `WorkTaskWatcherService.kt` — the pick-task watcher now starts only after a successful
  login, so a logged-out phone stops polling.
- `deploy/android/setup-android.ps1` + `build-android.ps1` — user-scope JDK 17 + Android
  SDK toolchain and a build/install script, so the app can be built without Android
  Studio, admin rights or an emulator. Full inventory and the remaining gaps (no release
  keystore, no device verification, no git): `docs/ANDROID_READINESS.md`.

#### Docs

- `docs/ANDROID_READINESS.md` (new) — toolchain inventory with exact paths, working
  commands, the three real blockers, and what the app actually contains.
- `docs/task-cards/android-operator-app-checklist.md` — prerequisites section added ahead
  of Epic 0; Epics 0–3 marked verified, 4–12 written-but-unverified on a device.
- `docs/AUTO_VOUCHER_ROADMAP.md` — automatic-voucher plan updated.

#### One invoice across two warehouses (2026-09-15)

- `apps/api/src/sales/sales.service.ts` — the `LOCATION_NOT_IN_WAREHOUSE` rejection is
  gone: a sale line may come from a shelf in another warehouse. It existed for a real
  reason (a client-supplied `locationId` could decrement another warehouse's shelf, and
  because sales run with `allowNegative` it went silently negative), but it was the wrong
  shape for this shop: the warehouses sit behind one counter, and the POS picks the shelf
  from the **most-stocked** location automatically — so ordinary sales were refused with
  «مکان انتخاب‌شده در این انبار نیست» without anyone doing anything unusual.
- `apps/api/src/sales/sale-locations.ts` (new) — the remaining line-location policy in one
  pure, tested place: a line without a shelf is the system location's business; a
  deactivated/deleted shelf stays sellable; a shelf with no row at all is accepted only if
  that product actually sits on it. The module deliberately takes no warehouse input, and
  `sale-locations.spec.ts` fails if the old rule is ever reintroduced.
- What carries the truth now: each line is an `InventoryLog` with its own `locationId`, so
  the right shelf is decremented and returns restock to that same shelf
  (`returns.service.ts`). `SaleInvoice.warehouseId` stays as the header — the counter the
  sale was rung up at — and is what the invoice list filters on. The printed customer
  receipt shows no warehouse; the shelf `path` (which starts with the warehouse code)
  already shows it in the on-screen cart and in today's invoices.
- Verified end to end on a real database, not with mocks:
  `apps/api/prisma/smoke-multi-warehouse.ts` (new) sells one line from warehouse A and one
  from a second warehouse on a single invoice and asserts each shelf dropped by exactly
  one. It builds its own fixture and deletes it afterwards. QA `T017` and `T096` updated
  from "rejected" to the new expectation (their `warehouse_os_qa` guard means neither ever
  touches the live database).

#### Build stamp — /health now says which build is running (2026-09-15)

- `VERSION` (new, repo root) — the product version in one place. `installer.iss`
  still carries its own `AppVersion` (0.4.0) for the Setup route; the two should be
  bumped together at the next installer build.
- `apps/api/scripts/write-build-info.cjs` (new) + the `build` script in
  `apps/api/package.json` — `nest build` now ends by writing
  `dist/build-info.json` (`version`, `builtAt`). It refuses to write into a missing
  `dist` — so a build that never happened cannot leave a stamp behind — and it
  refuses to stamp an empty `VERSION`, because a version number that looks
  authoritative and is wrong sends people after the wrong cause.
- `apps/api/src/common/build-info.ts` (new, with `build-info.spec.ts`) — reads that
  stamp and always returns the same shape, reporting `version: "unknown"` when it
  is absent or malformed. It does *not* fall back to `package.json`'s `0.0.1`,
  which is not a version anybody ever shipped. The reader is deliberately
  unfussy: a missing metadata file must never turn `/health` into a 500.
- `apps/api/src/app.service.ts` — `/health` reports `version`, `builtAt`, `kit` and
  `packagedAt` instead of the meaningless `0.0.1` from `package.json`. Reason: after
  an update, `{"status":"ok"}` cannot distinguish a half-applied update, a file
  replaced by the wrong one, and a service that never restarted. These four fields
  can.
- `deploy/windows/updates/build-update-kit.ps1` — re-stamps its own copy with the
  kit name + packaging time (`kit`, `packagedAt`), prints the stamp in the build
  summary and self-test, records it in `kit-contents.txt`, and now **fails the
  self-test** when the stamp is missing or names a different kit than the folder.
- `deploy/windows/updates/apply-update.ps1` — at 95% the health step also calls
  `/health` and prints the running build, then compares it with the kit's own stamp
  (`MATCH` / `MISMATCH`). A mismatch is the one failure that otherwise looks like
  success: files replaced, old process still answering.
- `deploy/windows/updates/restore-update.ps1` — the same comparison against the
  stamp inside the backup being restored, plus a `build` line in `restored.txt`.
  `deploy/windows/health-watch.ps1` was left alone on purpose: it is installed by
  `Setup.exe`, not by this kit, so an edit there would not reach the shop.

#### Blank price sheet — «پیش‌فاکتور سفید» (2026-09-16)

The counter keeps meeting the same case: the worker knows what the customer wants
(«لنت پراید جلو») but the product either does not exist in the system yet or the
price is not the worker's to set. Until now the options were to create a product on
the spot or to write on paper. This adds a third path: a price sheet with **free
text lines** that the worker creates from the phone (by voice or by hand) and the
manager prices and turns into a real invoice from the panel.

Why a separate model instead of reusing `Quotation`: `QuotationLine.productId` is
mandatory and the whole existing flow (print, convert, reports) is built on the
product being there. Making it nullable would have put a "line without a product"
case into every one of those paths. `BlankQuotation`/`BlankQuotationLine` are new
and additive; nothing existing was reshaped.

**Stock and ledger are untouched until conversion.** Nothing in
`BlankQuotationsService` writes `InventoryLog`; the only writer is
`SalesService.createInvoice`, called from `convert()`.

- `apps/api/prisma/schema.prisma` + `20260916120000_blank_quotation` — additive:
one enum and two tables, no change to any existing table.
- `20260916130000_blank_quotation_line_position` — adds
`BlankQuotationLine.position` and replaces the single-column index with
`(blankQuotationId, position)`. Why it was needed: without it the line order of a
sheet was `ORDER BY id`, i.e. **the order of the uuid**, so "line 2" of a price
sheet was whatever line happened to sort second. `createdAt` could not fix it —
all lines of a sheet are written in one transaction, so `CURRENT_TIMESTAMP` is
identical for every one of them. The smoke test below is what caught it: it asserted
that the suggestions come back in the order the worker spoke them and they did not.
- `apps/api/src/sales/blank-quotations.service.ts` (new with spec) — create / list /
detail / `prices` / `suggestions` / `convert` / `cancel`.
- **Two prices, deliberately separate.** `suggestedPrice` is what the phone guessed
and `finalPrice`/`pricedAt` is what the manager decided. The suggested number never
enters a total, an invoice or a document — it is a hint next to the line, and the
ledger's arithmetic only ever sees `finalPrice`.
- **Idempotent from the phone.** `idempotencyKey = mobile-<clientRequestId>`, unique
at the database level. The phone is offline-first, so a retry must not create a
second sheet that the manager then prices twice.
- **Conversion key cannot be chosen by the client**: it is `blank-<id>`, built from
the sheet itself. Two concurrent converts with two different client keys would have
created two invoices and deducted stock twice — the mistake already recorded in
`QuotationsService.convert`.
- **The three locks on convert**: every line must be linked to a real product, every
line must be priced, and the sheet must not be expired. A half-priced sheet reaching
`createInvoice` is the one path that can move stock on a number nobody agreed to.
- `locationId` is optional on convert, exactly as `InvoiceLineDto` means it: absent
means "I don't know where it is" and the invoice lands on the system
"unregistered stock" location. It is never a silent default of a user-visible shelf.
- **Semi-automatic linking** reuses `ProductsService.searchWithStock` — the same
engine the POS and the panel already search with. No second string-similarity
implementation was written; the suggestion carries stock and shelf path so
"link + pick shelf" is one click.
- `apps/api/src/sales/sales.controller.ts` + `apps/api/src/mobile/mobile.controller.ts`
and their modules — manager routes under `sales/blank-quotations`
(ADMIN/MANAGER/SALES), phone route `mobile/blank-quotations` (STAFF/SALES).
- Phone side (`apps/android`): a card on `ShiftHomeScreen` **outside the shift gate**
(sellers still cannot open an inventory shift and this path never needs one), a
row-per-line form with a continuously re-arming mic that captures **name and
quantity only** — the price stays manual — and a new outbox type
`BLANK_QUOTATION` with its own drain branch. No Room migration: the outbox `type`
column is a string and `payload` already carried JSON.
- Manager side (`apps/web`): a «برگه‌ی سفید» bucket in the quotations page, and
`apps/web/src/app/admin/quotations/_lib/blank-quote.ts` (with tests) computing the
display state. «چند قلم بی‌قیمت و ناوصل مانده» is the number that matters, and the
convert button is disabled **with its reason written next to it** — a disabled
button with no explanation sends the manager back to the phone.
- Print: `apps/web/src/app/admin/print/blank-quotation/[id]` +
`blank-quotation-sheet.tsx`. Unpriced lines print **blank** so the manager can fill
them in by hand, and the total is labelled «جمع N قلم قیمت‌خورده» rather than
looking like a final amount.

- `apps/api/prisma/smoke-blank-quotation.ts` — end-to-end smoke test on the real
database (the convention the other `smoke-*.ts` scripts follow, self-cleaning):
phone create + retry with the same key, stock untouched until conversion, early
converts rejected, suggestion path, manager pricing, conversion (stock 40 → 37),
double conversion, cancel, expiry, list filters and line order. Run:
`npx ts-node --transpile-only prisma/smoke-blank-quotation.ts`.

Evidence: `apps/api` 42 suites / 323 tests green, `apps/web` 33 files / 252 tests
green, `apps/android` 12 classes / 102 tests green (`gradlew testDevDebugUnitTest`),
`npx tsc --noEmit` clean for api and web, and the smoke script above green on the
dev database (61 checks). Both migrations were applied to the local dev database
(`migrate deploy`, then `migrate status` → up to date) and are additive-only.
**Not verified: no phone, no emulator, and no dashboard click-through** — the Android
screen, the voice re-arming and the panel interactions were proven by unit tests and
types, not by a human looking at them. Nothing here has been installed anywhere.

Pre-existing and untouched: `apps/api/test/qa/harness.ts` and `pooltune.qa.ts` do not
compile (service constructors gained arguments), which was already true before this
change.

### Migration baseline fixed (2026-08-03)

- `20260803090000_baseline_catchup` — reconciles migration history with the dev DB
  state that had been applied via `db push` / raw SQL (`docs/NEXT_TASK.md` §8).
  Marked applied on dev via `migrate resolve`; runs for real only on a fresh DB.
  Verified: a database built purely from migrations now equals `schema.prisma`
  exactly, and `migrate dev` no longer asks to reset. Adds `CREATE EXTENSION
  pg_trgm` (Prisma does not manage extensions) and strips an invalid `ASC` from
  the `Product.searchTokens` GIN index that Prisma's diff emitted.

### Desktop shell for the seller app (Tauri v2)

- New `apps/desktop` — wraps the existing `apps/web` in a Windows desktop frame.
  The web app is not rewritten; the only real reason for desktop is ESC/POS
  receipt printing, which a browser cannot do.
- **Real raw printing** via winspool (`OpenPrinter` → `StartDocPrinter` with
  `datatype = "RAW"` → `WritePrinter`). Graphical printing would rasterize the
  receipt and destroy the ESC/POS cut/drawer/compressed-text commands.
  On non-Windows it returns an error and **never** succeeds silently — a print
  path that reports success while printing nothing is the worst failure mode.
- Config lives in the user config dir, not next to the `.exe`: `Program Files` is
  not writable without admin, so saving would fail silently there.
- The capability declares `remote.urls`. The page is served from the on-prem
  server, so the webview origin is remote; without this the page cannot `invoke`
  at all and printing could never be called.
- First-run bootstrap: with no server URL stored there is no page to show, so a
  bundled local `setup.html` opens instead — server address, connection test,
  printer picker and test print. Styled strictly from `DESIGN_SYSTEM.md`.
- F11 / Ctrl+R handled by an injected in-window key listener, not a global
  shortcut (a global one steals the key from all of Windows).
- ⚠️ Not compiled or tested — written on macOS with no Rust toolchain. The first
  `cargo build` on Windows may need small signature fixes in the `windows` crate
  calls. See `apps/desktop/README.md`.

### Pick tasks — send a location to a worker's phone

- `PickTask` + `pick-tasks/` module. The seller at the counter sends one or more
  products (with exact location `path` and barcode) to the warehouse worker; the
  worker sees them on the Android app and taps «آوردم».
- **Deliberately does not touch stock.** It is a task board only — deduction still
  happens exclusively at invoice time through `InventoryOperationService` (Rule 1).
  So a picked-but-not-sold item never corrupts a stock number. Verified: after a
  full pick cycle, quantity was unchanged and zero ledger rows were written.
- Delivery is **polling via the existing WorkManager sync, not FCM** — the server is
  on-prem LAN, so push would add an internet + Google Play Services dependency for
  no benefit.
- `markPicked` uses an atomic claim, so if two workers tap at once only one wins and
  the second is told who already fetched it — otherwise two people walk to the same
  shelf.
- Unassigned tasks are visible to every worker; assigning to a specific worker is
  optional.

### Customer phone bank + SMS groundwork

- `Customer` restructured: identity is `firstName`/`lastName`, so a customer can be
  registered with **no phone at all**. Safe to restructure — the table was empty.
- `CustomerPhone`: several numbers per customer (mobile + landline), stored in a
  **normalized** form that is unique at database level.
- `normalizePhone` (`common/phone.util.ts`): Persian/Arabic digits → ASCII,
  `+98`/`0098`/`98` → `0`, strips spaces/dashes. Fixes a real defect — `۰۹۱۲۱۱۱۲۲۳۳`,
  `0912-111-2233` and `+989121112233` previously created three separate customers,
  which would have fragmented profiles and sent one person three SMS. 6 unit tests.
- Customer search matches first name, last name and partial phone. A query with no
  digits no longer matches every customer (`contains: ''` bug, caught in testing).
- `SmsMessage` queue + `SmsTemplate` (template text is data, not code — same choice
  as the Excel export). Messages are recorded before sending, so when an SMS panel is
  chosen it plugs in as a sender over the queue and nothing else changes.
- No SMS provider is wired yet, by decision — the adapter slot is left open.

### Sale invoices — backend (فاز ۴)

- `sales/` module: `POST /sales/invoices` (multi-line, atomic), list/detail,
  `POST /sales/invoices/:id/cancel` (ADMIN/MANAGER only), customer CRUD.
  Invoice create/list is ADMIN/MANAGER/SALES.
- `InventoryOperationService.execute` takes an **optional** `txClient`. Without it
  behaviour is unchanged, so all 11 existing callers are untouched. With it, every
  invoice line runs in one transaction — otherwise a line-4 stock shortage would
  leave lines 1–3 already deducted. Verified by test.
- `RETURN` added to `execute` (increments stock, logs `action=RETURN`) so invoice
  cancellation can compensate instead of deleting ledger rows.
- `Payment` + `Cheque` models: an invoice can have several payment rows, so mixed
  settlement (part cash, part cheque) works without a special case. `CREDIT` =
  نسیه (records debt, no cash received) and requires a customer.
- Omitting `payments` defaults to a single full CASH payment — the walk-in counter
  sale must not require an explicit payment row.
- `profit` is computed and stored at sale time from the latest `purchasePrice`;
  `null` if any line lacks one (a half-correct number is worse than none).
- `idempotencyKey` is unique at the database level, so a retry returns the existing
  invoice instead of creating a duplicate.

### Sale invoices — schema

- `20260803074912_add_sale_invoice` — additive, no data loss.
- New `Customer` (optional on a sale) and `SaleInvoice` (+ `InvoiceStatus`).
- `InventoryLog.invoiceId` — invoice lines *are* ledger rows, so an invoice total
  can never drift from the real stock movement. No separate line table.
- Cancellation writes compensating `RETURN` rows; ledger stays append-only.

---

## Next

v0.4

Authentication

v0.5

Image Upload

v0.6

Android

v0.7

Dashboard

v0.8

Accounting