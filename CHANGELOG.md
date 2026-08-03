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