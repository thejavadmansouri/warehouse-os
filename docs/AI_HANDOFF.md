# AI Handoff — Warehouse OS

**Date:** 2026-07-30
**Branch:** `feat/android-operator-epic0` (local only — nothing pushed)
**Last commit:** `f0cda05 feat(api): offline-sync + manager-approval backend (pending operations)`
**State:** Stage 3 (manager review) verified end-to-end and running. **Everything below is UNCOMMITTED.**

This document is the source of truth for the current verified state. See also
`docs/TEST_STATUS.md` (exact results) and `docs/NEXT_TASK.md` (what to do next).

---

## 0. Cold start (bring the stack up from nothing)

Prerequisites: PostgreSQL running with DB `warehouse_os` (see `DATABASE_URL` in
root `.env` → `postgresql://postgres:...@localhost:5432/warehouse_os`) and Node
(v24.x). **The whole monorepo is npm now — Bun has been removed (see §4).** Data
already seeded: 63k locations, 100 products, brands/vehicles/parts.

```bash
cd /Users/proman/warehouse-os

# 1. Install everything with npm (root workspaces). Prisma auto-generates from the
#    api schema via the root package.json `prisma.schema` field — no stale-schema
#    breakage anymore (see §4). Belt-and-suspenders check:
npm install
./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit   # must be 0 errors

# 2. Backend (nest build is broken — fast-uri; use `nest start`).
cd apps/api && npx nest start          # → http://127.0.0.1:3000

# 3. Web dev server (deps already installed by the root npm install above).
cd ../web && NEXT_PUBLIC_API_URL="http://127.0.0.1:3000" npx next dev -p 3001   # → http://localhost:3001

# 4. Seed the manager review queue with demo PENDING ops (idempotent, "demo-" prefix).
cd ../api && npx ts-node prisma/seed-pending.ts
```

Test login: `admin` / `test1234` (dev DB — original random bootstrap password was
overwritten; see §7). Open `http://localhost:3001/admin/review` to see the queue.

---

## 1. Current architecture

Warehouse OS = stock **source of truth**, fed by multiple sources through ONE
service (`InventoryOperationService.execute`) and ONE ledger (`InventoryLog`,
tagged with `source`). Website/accounting integrations plug in later as new
callers of that same service — no rewrite.

### The worker → sync → approve loop (offline-first, manager-gated)
```
Worker (Android, roaming; cellular for STT only)
  scan shelf + speak  →  capture LOCALLY (Room outbox, each row a client UUID)
        │  (near server / Wi-Fi)  →  WorkManager sync
Server (on-prem LAN, NestJS + Prisma + Postgres)
  POST /sync/operations  →  store as PENDING (deduped by clientRequestId)
        │
Manager (web admin, apps/web /admin/review)
  review pending per warehouse  →  APPROVE = commit to stock (idempotent) | REJECT = discard + reason
```

Key rules:
- **STT stays online (cellular).** No Vosk/Whisper offline engine (dropped by product decision). `SpeechToTextProvider` interface keeps the door open.
- **Offline is for the inventory writes only**, not voice. Worker capture never blocks on network.
- **Manager approval is the single commit point.** The worker's sync never touches authoritative stock — a double-sync creates a duplicate PENDING row, never doubled stock.
- **Persian voice matching** (backend engine): `parsingEngine.parse` → `ProductMatcher`. Never invents a vehicle model (family vs model separated); family-only never auto-selects a product (see prior commits `d6ed70b`, `ffb1c4f`).

### Backend endpoints (Stage 1, committed in `f0cda05`)
- `POST /sync/operations` — batch outbox upload; upsert by `clientRequestId`.
- `GET /manager/review/pending[?warehouseId=]` — pending queue with location.warehouse, product+brand+barcodes, worker, parsed/confidence.
- `POST /manager/review/:id/approve` — **atomic claim** (`updateMany where status='PENDING'`); only the winner commits via `execute({type:'IN', source:'WORKER_VOICE'})`. Race-safe idempotent.
- `POST /manager/review/:id/reject` — sets REJECTED + stores `reviewNote`; no stock change.

### Android (Stage 2, UNCOMMITTED)
- Room `outbox` (`OutboxEntity` PK = clientRequestId), `OutboxDao`, `OperatorDatabase`, `DatabaseModule`.
- `OutboxRepository` (local-first enqueue + drain), `SyncWorker` (Hilt WorkManager, network-constrained, backoff), `SyncScheduler`.
- Voice confirm now **enqueues to the outbox** (was: direct commit). ShiftHome shows "N pending" badge + syncs on entry. Manifest disables WorkManager default initializer.

### Web (Stage 3 + build-fix, UNCOMMITTED)
- `/admin/review` page (react-query + shadcn), api functions, `PendingOperation` type, nav entry.
- `apps/web` build was broken pre-existing; fixed (see §5).

---

## 2. Verified Stage 3 flows (browser + DB)

All 7 passed. Full detail in `docs/TEST_STATUS.md`.

| Flow | Verified |
|---|---|
| Pending operations load (all fields incl. confidence) | ✅ |
| Warehouse filter | ✅ |
| Product search | ✅ |
| Product override → approve (commits the OVERRIDDEN product) | ✅ |
| Approve → real inventory commit (stock 0 → 3 in DB) | ✅ |
| Reject + reason (REJECTED, reason stored, no stock change) | ✅ |
| Idempotency (2 concurrent approves → stock rose ONCE, not doubled) | ✅ |

---

## 3. Exact build/test results

- **TypeScript (web):** `tsc --noEmit` → **0 errors** (was 114).
- **Production build:** `npx next build` → **✓ Compiled successfully in 26.1s**; `/admin/review` in route table.
- **Backend TS:** `tsc -p apps/api/tsconfig.json --noEmit` → **0 errors** (after regenerating client from apps/api schema — see §4).
- **Runtime:** backend on `http://127.0.0.1:3000`, web dev on `http://localhost:3001` (both may still be running).
- **API smoke:** login `admin` / `test1234` → `GET /manager/review/pending` returns full rows.

---

## 4. Package-manager landmine — RESOLVED 2026-07-30 (all-npm)

**Was:** `apps/web` was a **Bun** project (`bun.lock`, `bun` in its `start` script)
inside the root **npm** workspaces (`package-lock.json`). The two managers fought over
one `node_modules`, causing (1) corrupted web deps (`lucide-react` barrel went missing on
`npm install`), (2) the Prisma client silently regenerated from the **stale root
`prisma/schema.prisma`** (no `path`/`depth`/`PendingOperation`) → broken backend, and
(3) a stray root `bun.lock` migrated from `package-lock.json`.

**Fix applied (this session) — the monorepo is now single-manager npm:**
- Deleted `bun.lock` (root) and `apps/web/bun.lock`; only `package-lock.json` remains.
- Pinned `"packageManager": "npm@11.16.0"` in root `package.json`.
- Added `"prisma": { "schema": "apps/api/prisma/schema.prisma" }` to root `package.json`,
  so **every** `prisma generate` — including the automatic `@prisma/client` postinstall —
  resolves the **api** schema, not the stale root one. (The ambiguous root `prisma/`
  files were left in place but are now irrelevant to generation; deleting them is optional
  cleanup, not required.)
- Changed web `start` from `bun .next/standalone/server.js` → `node …`.

**Verified:** wiped all `node_modules`, ran `npm install` twice. After each, the generated
client contains `PendingOperation` (i.e. came from the api schema) and
`tsc -p apps/api/tsconfig.json --noEmit` = **0 errors**; web `tsc` = **0 errors**;
`lucide-react` resolves from `apps/web/node_modules` (856 KB barrel, 5469 exports); no
`bun.lock` was regenerated. **`npm install` is now safe to run at root** — no manual
`prisma generate --schema=…` guardrail needed (though it's still harmless to run).

---

## 5. Modified files (this option-2 pass + Stage 2/3, all UNCOMMITTED)

**Web build-fix (root causes 2–5):**
- `apps/web/src/lib/api.ts` — `ApiRequestInit = Omit<RequestInit,"body"> & {body?: unknown}` + `isRawBody` guard (fixes 30 body-type errors, no `any`); `searchProducts` extracts `.data` from paginated `{data,meta}`.
- **restored 8 shadcn components:** `apps/web/src/components/ui/{input,label,textarea,select,command,checkbox,switch,dropdown-menu}.tsx`.
- `apps/web/src/app/admin/inventory-count/[id]/page.tsx` — `UseQueryResult<InventoryCount>`.
- `apps/web/src/components/labels/label-print-dialog.tsx` — typed union query (`LocationLabel | ProductLabel`).
- `apps/web/src/app/admin/location-types/page.tsx`, `vehicle-models/page.tsx`, `products/_components/product-form-dialog.tsx` — `useForm<z.input, unknown, z.output>` (rhf 3-generic) + `numberFieldProps` input-typed.
- `apps/web/tsconfig.json` — exclude `examples/` (socket.io scratch code).

**Stage 3 web (from prior turn):** `apps/web/src/app/admin/review/page.tsx` (new), `src/lib/{api,types,nav}.ts`.

**Backend (Stage 3 hardening):** `apps/api/src/pending-operations/pending-operations.service.ts` — atomic-claim idempotent approve + enriched review include.

**Android (Stage 2):** `data/local/*`, `data/remote/dto/SyncDto.kt`, `data/repository/OutboxRepository.kt`, `data/sync/*`, edited `ApiService.kt`, `DatabaseModule.kt`, `ShiftHome{Screen,ViewModel}.kt`, `VoiceEntryViewModel.kt`, `AndroidManifest.xml`.

---

## 6. Current git status (snapshot 2026-07-30)

Branch `feat/android-operator-epic0`. **Not committed, not pushed.**

Modified (M): AndroidManifest, ApiService.kt, DatabaseModule.kt, ShiftHome{Screen,ViewModel}.kt,
VoiceEntryViewModel.kt, pending-operations.service.ts, web inventory-count/location-types/
product-form-dialog/vehicle-models pages, label-print-dialog.tsx, web lib/{api,nav,types}.ts, web tsconfig.json.

Untracked (??): android `data/local/`, `data/remote/dto/SyncDto.kt`, `data/repository/OutboxRepository.kt`,
`data/sync/`; web `app/admin/review/`; web `components/ui/{checkbox,command,dropdown-menu,input,label,select,switch,textarea}.tsx`;
root `bun.lock`.

---

## 7. Known database test pollution

Verification approvals committed real IN stock into the **dev DB**:
- `admin` password was set to `test1234` (was a random bootstrap password).
- Approved test ops added stock: پمپ هیدرولیک +3, سپر جلو کوییک +5, فیلتر روغن پژو 206 +4 (at location W2 > طبقه 1 / «انبار شماره دو»).
- All `demo-*` PendingOperation rows were deleted, but the **inventory deltas and the corresponding `InventoryLog` IN rows remain**. Reset the dev DB if a clean baseline is needed.

---

## 8. `committedLogId` issue

`approve()` commits inventory correctly but does **not** back-link the created
`InventoryLog.id` into `PendingOperation.committedLogId` (stays null). Minor —
the commit works; only the audit back-reference is missing. `execute()`'s return
value would need to surface the created log id.

---

## 9. Recommended next task

See `docs/NEXT_TASK.md` for the exact steps. In short:
1. **Commit this verified state** (it's all uncommitted → work-loss risk). This now
   includes the all-npm migration: root `package.json` (`packageManager` + `prisma.schema`),
   web `package.json` (`start` uses `node`), removed `bun.lock` files, regenerated
   `package-lock.json`.
2. ~~Standardize on npm and drop Bun~~ — **DONE 2026-07-30** (see §4). Optional leftover:
   delete the now-irrelevant root `prisma/` legacy files (`schema.prisma`, `bu89.prisma`,
   `schema90.prisma`, `*.backup.prisma`) for tidiness.

---

## 10. Related docs & memory (broader project context)

This handoff is Stage-3-focused. For the whole project, also read:
- `docs/TEST_STATUS.md` — exact build/test + Stage 3 flow results.
- `docs/NEXT_TASK.md` — the exact next actions + guardrails.
- `docs/task-cards/android-operator-app-checklist.md` — Android epics 0–12 breakdown/status.
- `docs/voice-matching-improvement-plan.md` — Persian voice matching P0/P1/P2 plan + empirical findings.
- `docs/PROGRESS.md` — earlier project progress notes.
- `apps/api/prisma/seed-pending.ts` — reusable seed for the review queue (`ts-node`).
- **Auto-loaded memory** (`.claude/.../memory/MEMORY.md`): project mission & priorities
  (speed-per-worker-hour), and the voice preview-vs-commit decision.

Project shape: NestJS + Prisma + Postgres API, Next.js admin web (`apps/web`), Kotlin/
Compose Android operator app (`apps/android`). Roadmap beyond this: connect to an
accounting app and a website (a web sale decrements stock via the same
`InventoryOperationService.execute({type:'SALE', source:'WEBSITE_ORDER'})` path).
