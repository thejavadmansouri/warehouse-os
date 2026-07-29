# Voice → Product Matching — Architecture Review & Improvement Plan

Scope: make the Persian voice product-suggestion engine smarter and more reliable
for a real warehouse pilot, **without** breaking existing APIs or the
propose → confirm → commit safety model.

---

## 1. Current architecture (as it actually is)

Two independent stages:

```
text
 └─ ParsingEngineCore.parse()            apps/api/src/engine/parsing-engine.core.ts
     1 Normalizer        normalizer.stage.ts        Arabic→Persian letters only
     2 Tokenizer         tokenizer.stage.ts
     3 SpellCorrection   spell-correction.stage.ts  tiny hardcoded map
     4 NumberParser      number-parser.stage.ts     word numbers + normalizeDigits (number.util.ts)
     5 MatchingStage     matching.stage.ts          per-entity TRIES (exact), payloads[0]
     6 Classification    classification.stage.ts
     7 Validation        validation.stage.ts
     8 Confidence        confidence.stage.ts
     9 ContextResolution context-resolution.stage.ts
   → parsed = { productName, brand, vehicleFamily, vehicleVariant, quantity, unit, good/badQuantity }

parsed
 └─ ProductMatcherService                 apps/api/src/inventory/product-matcher.service.ts
     findPartCatalogIdByName / findBrandIdByName / findVehicleModelIdsByName   (ILIKE contains + findFirst)
     match(): fetchCandidates (ILIKE OR) → scoreCandidate → computeConfidence
     → { status: NONE | SUGGEST | AUTO, best, suggestions[] }

VoiceInventoryService                     apps/api/src/inventory/voice-inventory.service.ts
   process()  → NONE/SUGGEST propose · AUTO commits (legacy, web)
   preview()  → NONE/SUGGEST propose · AUTO returns needConfirm proposal (NO commit)   ← Android path
   confirm()  → the single write path (IN operation)
```

The dictionary that drives stage 5 is **loaded from the DB**
(`DictionaryLoaderService.load()`: partCatalog + vehicleModel + brand + their
`aliases[]`) — but only **once, at `onModuleInit`** in `parsing-engine.service.ts`.

### Strengths (keep these)
- Clean two-stage split: entity extraction (engine) vs product ranking (matcher).
- Matcher priority is domain-correct: part > vehicle > brand; **vehicle mismatch is a
  hard disqualify**, not just a lower score (`product-matcher.service.ts` ~L270-281).
- Confidence is structural (which of part/vehicle/brand matched), not raw score —
  resists overconfidence.
- Dictionary is DB-driven, so brands/parts/vehicles + aliases already feed extraction.
- `preview` already enforces propose-not-commit for the Android app.

---

## 2. Gaps that will hurt in a real pilot (prioritized)

### P0 — correctness, cheap to fix, needed for the pilot

1. **Normalization is inconsistent between tokens and the dictionary.**
   `NormalizerStage` normalizes the spoken tokens (Arabic→Persian letters) but the
   TRIES in `MatchingStage` are built from **raw** DB strings
   (`DictionaryLoaderService` passes names/aliases unmodified). A token normalized to
   `ی`/`ک` will not match an alias stored with `ي`/`ك`. Both sides must pass through the
   **same** normalizer.

2. **Persian digits are not normalized globally.** `normalizeDigits()` exists in
   `number.util.ts` but is only applied inside the number-parser. `«پژو ۲۰۶»` keeps its
   Persian digits and won't match `«پژو 206»` in the trie — and the number-parser may
   even swallow `۲۰۶` as a quantity. Digit normalization must happen in
   `NormalizerStage`, up front, for the whole string; and a number glued to a vehicle
   family must not be consumed as a quantity.

3. **`ProductMatcherService.norm()` is `trim().toLowerCase()` only** (L47-49) — no
   Persian normalization at all. Every substring/alias comparison in `scoreCandidate`
   and the `findXByName` lookups is done on un-normalized text.

4. **Position / side are extracted then dropped.** `parsing-engine.core.ts` hardcodes
   `position: null, side: null` (L234-236). `«لنت جلو»` vs `«لنت عقب»` are different
   SKUs; today the front/rear signal is lost before matching.

5. **`findPartCatalogIdByName` / brand / vehicle use `findFirst` + `contains`** — they
   return **one arbitrary** row. `«لنت»` may resolve to the wrong part.

6. **Debug `console.log`s in `matching.stage.ts`** (L145-148) — production noise on
   every request.

7. **Dictionary staleness.** Loaded once at startup. A newly seeded product, a new
   alias, or a learned correction has **no effect until the process restarts**. Fatal
   for a "learns from corrections" feature.

### P1 — smarter, more reliable matching

8. **No `pg_trgm` / `normalizedName` index.** All candidate generation is `ILIKE
   %token%` across name/description/partNumber (`fetchCandidates`). No typo tolerance,
   and at 100k products this is a sequential scan. There is **no** trgm/GIN index in
   any migration.

9. **No fuzzy scoring at the DB layer.** Alias matching is exact normalized equality
   (`norm(a) === pn`). A near-miss ("تکستر" vs "تکستار") only survives if it happens to
   be in the tiny `speechErrors` map.

### P2 — the learning loop (the strategic ask)

10. **No corrections capture and no feedback into matching.** `confirm()` receives
    `{ productId, locationBarcode, quantity, sessionId }` — it does **not** receive the
    original phrase or which product was *suggested*, so a manager picking a different
    product than the top suggestion teaches the system nothing. There is no corrections
    table, no phrase memory, no alias auto-promotion, no recency/frequency signal.

---

## 3. Improvement plan

### 3.1 One canonical Persian normalizer (P0)
Create a single `normalizePersian(text)` utility and use it **everywhere**:
- Arabic→Persian letters (`ي ى → ی`, `ك → ک`, `ة → ه`), Persian/Arabic digits → ASCII,
  strip tashkil/tatweel/bidi marks, ZWNJ → space (keep raw for display), collapse
  whitespace, Unicode NFC, casefold Latin (brands arrive as `تکستار` **and** `Textar`).
- Must be **idempotent** (`normalize(normalize(x)) === normalize(x)`) — assert in tests.
- Apply in: `NormalizerStage`, `DictionaryLoaderService` (normalize every alias before
  trie insert), and `ProductMatcherService.norm()`.

### 3.2 `normalizedName` columns + pg_trgm (P0/P1)
- Add nullable `normalizedName` to `Product`, `PartCatalog`, `Brand`, `VehicleModel`
  and a normalized alias array; backfill; keep updated on write.
- Migration enables `pg_trgm` and adds GIN trgm indexes on the `normalizedName`
  columns. Index concurrently; column is nullable → safe.
- Candidate generation switches from `ILIKE %x%` to `similarity(normalizedName, :q)`
  ranking + exact SKU/barcode/alias short-circuit. Never normalize at query time —
  that defeats the index.

### 3.3 Keep position/side through the pipeline (P0)
- Stop nulling `position`/`side` in `parsing-engine.core.ts`; carry them into `parsed`.
- Use them in `ProductMatcherService`: when the product name/description (normalized)
  contains the position/side, boost; when it contradicts (front vs rear), penalize
  strongly. Don't hard-disqualify (data is inconsistent) but make it a strong signal.

### 3.4 Live dictionary (P0)
- Reload the dictionary when reference data changes: a bump/invalidate on
  brand/part/vehicle/product writes, or a short TTL, or an admin `reload` call. New
  aliases (incl. learned ones) must take effect without a restart.

### 3.5 The learning loop (P2 — the core of this phase)
**Capture** (additive, no breaking change):
- `confirm()` (and the preview flow) also send the **raw phrase** and the
  **suggestedProductId** (the preview's best/top suggestion). Additive request fields.
- New table `VoiceMatchCorrection`:
  `{ id, normalizedPhrase, parsedProductName, parsedBrand, parsedVehicle,
     suggestedProductId?, chosenProductId, warehouseId?, userId?, createdAt }`.
  Write a row whenever `chosenProductId !== suggestedProductId` (a real correction) —
  and optionally on every confirm for frequency data.

**Apply**, in increasing power:
- **Phrase memory (strongest, do first):** on preview, look up
  `normalizedPhrase → chosenProductId` for this warehouse. A confident prior match is
  preselected as the top suggestion (still shown for confirmation — never auto-commit).
- **Recency/frequency boost:** rank products this worker/warehouse recently confirmed
  higher on ties.
- **Alias auto-promotion:** when the same token→product/brand/part correction repeats
  ≥ N times, add it as an alias on that product/part/brand → the trie & similarity
  layers both benefit. Requires the live-dictionary reload (3.4).

### 3.6 Optional LLM fallback (P2, later)
Only for phrasings the rules miss. Must return strict JSON against the entity schema,
be validated before use, be optional (offline-safe), and **never** auto-commit.

---

## 4. Non-negotiable constraints (for any implementer)

- **Do not break existing APIs.** `/inventory/voice`, `/inventory/voice/preview`,
  `/inventory/voice/confirm`, `/mobile/count/*` keep their shapes. New request/response
  fields must be **additive and optional**.
- **Preserve propose → confirm → commit.** `preview` never writes; `confirm` is the
  only write path; a confident match is proposed, never silently committed.
- **All intelligence stays in the backend.** Android sends spoken text + (on confirm)
  the chosen productId. No parsing/matching/learning on the device.
- **No large refactors.** Work within the existing engine-stage + matcher structure.
  Don't rewrite the pipeline; improve stages in place.
- **Migrations must be safe:** nullable columns, backfill scripts, `CREATE INDEX
  CONCURRENTLY`, no destructive changes. There are two schema files in this repo —
  `apps/api/prisma/schema.prisma` is the authoritative one the code targets.
- **Persian normalization is idempotent** and applied to **both** stored data and
  queries.
- **Never hardcode a unit's multiplier** — resolve unit→base factor from the product.

---

## 5. Ready-to-paste implementation prompt (for GLM / Gemini / other coding model)

> You are improving the Persian voice → product matching in an existing NestJS +
> Prisma + PostgreSQL backend (Warehouse OS), at `apps/api`. Do **not** rewrite the
> pipeline; improve it in place. Do **not** break existing APIs. Preserve the
> propose → confirm → commit model. Keep all logic server-side.
>
> **Read these first** and match their style:
> `apps/api/src/engine/parsing-engine.core.ts`,
> `apps/api/src/engine/pipeline/normalizer.stage.ts`,
> `apps/api/src/engine/pipeline/matching.stage.ts`,
> `apps/api/src/engine/pipeline/number-parser.stage.ts` + `utils/number.util.ts`,
> `apps/api/src/engine/services/dictionary-loader.service.ts`,
> `apps/api/src/inventory/product-matcher.service.ts`,
> `apps/api/src/inventory/voice-inventory.service.ts`,
> and the `Product`, `PartCatalog`, `Brand`, `VehicleModel` models in
> `apps/api/prisma/schema.prisma` (the authoritative schema).
>
> **Task 1 — one canonical Persian normalizer.** Create
> `apps/api/src/engine/utils/persian-normalize.ts` exporting `normalizePersian(text)`:
> Arabic→Persian letters (ي ى→ی, ك→ک, ة→ه), Persian/Arabic digits→ASCII, strip
> tashkil/tatweel/bidi marks, ZWNJ→space, collapse whitespace, NFC, casefold Latin.
> It must be idempotent. Use it inside `NormalizerStage` (replace the ad-hoc map; keep
> the existing "جلوی→جلو" style lemma rules but run them after normalization) and in
> `DictionaryLoaderService` (normalize every name/alias before it is inserted into the
> tries) and in `ProductMatcherService.norm()`. Add a unit test asserting idempotency
> and that «پژو ۲۰۶» and «پژو 206» normalize equal.
>
> **Task 2 — stop dropping position/side.** In `parsing-engine.core.ts`, carry the
> parsed `position` and `side` into `data` instead of hardcoding null. In
> `ProductMatcherService.scoreCandidate`, add a strong boost when the product
> name/description (normalized) agrees with the requested position/side, and a strong
> penalty when it contradicts (front vs rear). Do not hard-disqualify.
>
> **Task 3 — normalizedName + pg_trgm.** Add nullable `normalizedName` to `Product`,
> `PartCatalog`, `Brand`, `VehicleModel` (+ a normalized alias array where aliases
> exist). Write a Prisma migration that: enables `pg_trgm`; backfills `normalizedName`
> from `normalizePersian(name)`; creates GIN trgm indexes `CONCURRENTLY`. Keep
> `normalizedName` updated on create/update. In `ProductMatcherService.fetchCandidates`,
> replace the `ILIKE %token%` OR-list with: exact SKU/barcode/alias match (high
> priority) UNION `similarity(normalizedName, :normalizedQuery)` above a threshold,
> ordered by similarity, capped at the existing `MAX_CANDIDATES`. Do not normalize at
> query time.
>
> **Task 4 — live dictionary.** Make `parsing-engine.service.ts` able to reload the
> dictionary without a process restart (invalidate + rebuild on reference-data writes,
> or a short TTL, or an admin-only `POST /engine/reload`). New aliases must take effect
> for the next request.
>
> **Task 5 — corrections capture (additive).** Extend the confirm path so the client
> may send the raw spoken `text` and the `suggestedProductId` (both optional — existing
> callers keep working). Add a `VoiceMatchCorrection` model
> `{ id, normalizedPhrase, parsedProductName?, parsedBrand?, parsedVehicle?,
> suggestedProductId?, chosenProductId, warehouseId?, userId?, createdAt }` and write a
> row on confirm when `chosenProductId !== suggestedProductId`.
>
> **Task 6 — apply corrections (phrase memory first).** In `preview`, before ranking,
> look up `VoiceMatchCorrection` by `normalizedPhrase` (+ warehouse) and, if a
> consistent prior choice exists, surface that product as the top suggestion (still
> `needConfirm` — never auto-commit). Add a recency/frequency boost in
> `scoreCandidate` for products recently confirmed by this warehouse/worker. (Alias
> auto-promotion after N repeats can be a follow-up.)
>
> **Constraints:** additive API changes only; `preview` never writes; `confirm` stays
> the only write path; safe migrations (nullable, backfill, CONCURRENTLY); remove the
> `console.log`s in `matching.stage.ts`; keep everything in the backend; add/extend
> tests where the engine already has them (`apps/api/src/engine/__tests__`).

---

## 5b. Empirical findings (live pipeline run on the real DB, post-P0)

After the P0 normalization fixes, running the engine + matcher end-to-end on the
target phrases surfaced the **dominant** remaining problem — vehicle family
resolution — which is bigger than P0 and is now the top priority:

| Input | Parsed | Problem |
|---|---|---|
| «سی تا لنت جلو تکستار پراید» | product ✅ «لنت ترمز جلو», brand ✅ «تکستار», qty ✅ 30, **vehicle = null** | «پراید» falls into unknownTokens — the vehicle trie has «پراید 111/131…», not the bare family «پراید» |
| «فیلتر روغن پژو ۲۰۶ سرکان» | product ✅, brand ✅, **vehicle = «پارس LX» (WRONG)**, «206» unknown | bare «پژو» matches many variants; `resolveBestVehicle` picks the wrong one and the disambiguating «206» is separated |
| «لنت عقب پراید» | product ✅ «لنت ترمز عقب» | «پراید» unknown again |

**Root causes (engine/dictionary, P1-sized):**
1. The vehicle dictionary carries only full variant names as trie keys. Family-level
   mentions («پراید», «پژو») don't match. Add family aliases (derived from the model
   name) so the family is recognized, and let the matcher's
   `findVehicleModelIdsByName` fan out to all trims (it already does).
2. `resolveBestVehicle` (`matching.stage.ts`) picks a wrong variant when the family is
   ambiguous and the disambiguating number is a separate token. It must combine an
   adjacent model number («پژو» + «206») before choosing, and stay at family level
   when no variant is given.
3. `MODEL_NUMBERS` in `number-parser.stage.ts` is a hardcoded set; derive vehicle model
   numbers from the vehicle dictionary instead so new models don't get eaten as
   quantities.
4. Data coverage: confirm the pilot's real SKUs (e.g. a پراید front brake pad) actually
   exist as products, else even a perfect parse returns nothing.

## 6. Pilot-readiness checklist (before real workers, in a few days)

- [ ] P0 items done: shared normalizer (digits + letters + ZWNJ), position/side kept,
      debug logs removed, dictionary reloadable.
- [ ] `normalizedName` + pg_trgm live and backfilled; candidate gen uses similarity.
- [ ] Corrections captured on confirm; phrase memory feeding preview.
- [ ] Seed data sanity: brands/parts/vehicles/aliases cover the pilot's real SKUs
      (products.json import done — 100 products currently).
- [ ] Test on **recorded real warehouse audio**, not clean phrases: «سی تا لنت جلو
      تکستار پراید», «۳۰ تا لنت جلو تکستار پراید», mixed Latin brands, half-sentences.
- [ ] Confirm the propose→confirm→commit flow end-to-end from the Android app against
      a real shelf barcode.
