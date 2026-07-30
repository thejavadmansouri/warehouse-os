# Test Status — Warehouse OS

**Date:** 2026-07-30 · **Scope:** Stage 3 (manager review) + `apps/web` build recovery
**State:** verified end-to-end and running. Uncommitted.

---

## Build / typecheck results

| Check | Command | Result |
|---|---|---|
| Web TypeScript | `tsc --noEmit -p apps/web/tsconfig.json` | ✅ **0 errors** (was 114) |
| Web production build | `npx next build` (in apps/web) | ✅ **Compiled successfully in 26.1s**; `/admin/review` in route table |
| Backend TypeScript | `tsc -p apps/api/tsconfig.json --noEmit` | ✅ **0 errors** (after `prisma generate --schema=apps/api/prisma/schema.prisma`) |
| Android build | `./gradlew :app:assembleDevDebug` | ✅ (last verified: Stage 2, BUILD SUCCESSFUL, APK ~44 MB) |
| Engine unit tests | `jest src/engine/__tests__/parsing-engine.spec.ts` | ✅ 6/6 (prior turn) |
| Web API contract tests (android) | `testDevDebugUnitTest` | ✅ 10/10 (prior turn) |

Runtime: backend `http://127.0.0.1:3000`, web dev `http://localhost:3001`.
Test login: `admin` / `test1234` (password set during verification — see handoff §7).

---

## Stage 3 flow verification (browser + DB)

| # | Flow | How verified | Result |
|---|---|---|---|
| 1 | Pending operations load | `/admin/review` rendered 2 cards with warehouse, worker, time, type=IN, location (W2>طبقه1), qty+unit, **confidence (72%/88%)**, matched product+brand, barcode/SKU, transcript, PENDING badge | ✅ |
| 2 | Warehouse filter | Dropdown showed «همه‌ی انبارها» + derived «انبار شماره دو»; selecting filtered the list | ✅ |
| 3 | Product search | Typed «لنت» / «فیلتر روغن» → correct product results (after fixing `searchProducts` to read paginated `.data`) | ✅ |
| 4 | Product override → approve | Approved with override productId (فیلتر روغن پژو 206) → op.productId switched to override; **override product stock 0→4**, original (سپر) unchanged at 5 | ✅ |
| 5 | Approve → commit | Clicked «تأیید و ثبت موجودی» → op removed from queue; DB: op APPROVED, **product stock 0 → 3** | ✅ |
| 6 | Reject + reason | «رد» → dialog → entered reason → confirmed; DB: status **REJECTED**, `reviewNote` stored, `reviewedAt` set, **stock unchanged (0)** | ✅ |
| 7 | Idempotency (double request) | Fired **2 concurrent** `POST /manager/review/:id/approve`; both 201; **stock rose by 5 once (not 10)** — atomic claim holds | ✅ |

Notes:
- The cmdk option-click in the browser had a targeting quirk (harness, not app); the override was therefore also verified via the exact API path the UI triggers (`approve` with `{productId}`).
- One live bug was found and fixed during verification: `/products/search` returns paginated `{data,meta}` but `searchProducts` expected a bare array (`items.map is not a function`). Fixed in `apps/web/src/lib/api.ts` (client-side, no backend change).

---

## Known gaps / not yet tested
- **No real-device test** of the full Android outbox → sync → approve loop (compiles + backend round-trip verified; not run on a phone).
- **`committedLogId`** not back-linked on approve (handoff §8).
- **Dev-DB test pollution**: approvals left IN stock deltas (handoff §7).
- Count flow still commits directly (not routed through the outbox); only voice stock-in is offline-first.
