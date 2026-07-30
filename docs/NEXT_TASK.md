# Next Task — Warehouse OS

**As of:** 2026-07-30 · Read `docs/AI_HANDOFF.md` first. Stage 3 is verified and running,
but **everything is uncommitted** and the repo has a package-manager landmine.

---

## PRIMARY next task: commit the verified state (work-loss risk)

All of Stage 2 (Android outbox), Stage 3 (web review page), and the `apps/web`
build recovery are **uncommitted**. This is verified, working code — commit it
before anything else.

Suggested split (branch `feat/android-operator-epic0`, do NOT push unless asked):
1. **Android offline outbox (Stage 2):**
   `apps/android/.../data/local/`, `data/remote/dto/SyncDto.kt`, `data/repository/OutboxRepository.kt`,
   `data/sync/`, + edited `ApiService.kt`, `DatabaseModule.kt`, `ShiftHome{Screen,ViewModel}.kt`,
   `VoiceEntryViewModel.kt`, `AndroidManifest.xml`.
2. **Backend approve hardening:** `apps/api/src/pending-operations/pending-operations.service.ts`.
3. **Web manager review + build recovery (Stage 3):** `apps/web/src/app/admin/review/`,
   the 8 restored `components/ui/*.tsx`, `lib/{api,nav,types}.ts`, `tsconfig.json`, and the
   typed pages (`inventory-count`, `location-types`, `vehicle-models`, `product-form-dialog`,
   `label-print-dialog`).
   - **Decide** whether to commit the new root `bun.lock` (tied to the PM problem below —
     ideally resolve that first, then commit the right lockfile).
4. **Docs + seed helper:** `docs/{AI_HANDOFF,TEST_STATUS,NEXT_TASK}.md` and
   `apps/api/prisma/seed-pending.ts` (reusable review-queue seed).

Before committing: run the guardrail below so the committed state actually builds.

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
