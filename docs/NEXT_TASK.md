# Next Task — Warehouse OS

**As of:** 2026-07-30 · Read `docs/AI_HANDOFF.md` first.

## CURRENT DIRECTION (2026-07-30): UI/UX polish + scope freeze

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
8. **Proper Prisma migration baseline for production** — the dev DB has pre-existing drift (`PendingOperation`,
     `Asset` photo columns, `ProductCreationRequest`, the `pg_trgm` extension + `idx_product_*_trgm`
     indexes, and more were applied via `db push` / raw SQL, never migrated). Author a clean migration
     baseline before the on-prem Windows deploy. Never `migrate reset` the dev DB (63k locations seeded).
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
