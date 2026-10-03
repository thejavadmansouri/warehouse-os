# Redesign Prompt — Warehouse OS (paste into a fresh session)

> This is a **visual/UX redesign only** task. Do **NOT** add features, change the backend,
> change API contracts, or alter business logic. Do not "improve" behavior. Keep every screen
> and endpoint working exactly as it does now. If a change risks breaking functionality, don't
> make it. The user explicitly asked for **no new code and no mess-ups** — restyle, don't rewrite.

## What this is
Warehouse OS: a **Persian (Farsi), right-to-left** warehouse-management system for an Iranian
car-parts warehouse. Two clients, one NestJS+Postgres backend (do not touch the backend):
- **Web admin** — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, at `apps/web`.
- **Android operator app** — Kotlin + Jetpack Compose (Material 3), at `apps/android`.

Redesign **both**. The entire UI is Persian and RTL — keep all Persian strings and RTL.

## Read first
`docs/REDESIGN_BRIEF.md` — full page/screen inventory, users/roles, and the hard constraints.
Follow it, and layer the NEW direction below on top of it.

## New design direction (this is what changed)
1. **Color: orange → blue + white.** The brand accent must become **blue** (not orange).
   Overall feel: clean **blue on white / very-light** surfaces. Keep status colors semantic
   (success green, warning amber, error red) and keep the focus ring visually distinct from
   the error red. Suggested: primary blue around OKLCH hue ~250–255; airy white/near-white
   backgrounds; restrained use of color (blue for primary actions/highlights only).
2. **Minimal & simple.** Strip visual clutter. Fewer borders/boxes, more whitespace, calm
   hierarchy. Every screen should feel obvious at a glance. Remove decorative noise.
3. **Bigger icons.** Icons throughout (nav, actions, cards) should be noticeably larger and
   clearer — this is a warehouse tool used quickly, sometimes at arm's length.
4. **Information-forward — make the key numbers big.** The data the user cares about must be
   the largest thing on screen. Concretely: in the products/inventory views, the **quantity /
   stock number must be much larger and bolder** than it is now (it's currently small — make it
   a prominent focal number). Prices, totals, counts, and confidence % should read instantly.
   Labels and chrome shrink; the numbers grow.

## Exactly where to make changes (tokens & styles, not logic)
- **Web colors:** `apps/web/src/app/globals.css` — OKLCH CSS variables for both `:root` (light)
  and `.dark`. Change `--primary`, `--accent`, `--ring`, `--sidebar*`, `--chart-*` from the
  orange hue to blue. Surfaces stay white/near-white. This one file drives the whole web palette.
- **Web components:** `apps/web/src/components/ui/*` (shadcn primitives) and the page files under
  `apps/web/src/app/admin/*` — adjust sizing/spacing/typography for the minimal, big-number look.
  Prefer editing shared primitives + the design tokens over per-page hacks.
- **Android colors:** `apps/android/app/src/main/java/com/warehouseos/operator/ui/theme/Color.kt`
  (light + dark Material 3 roles — already centralized; swap the orange values for blue).
- **Android type/scale:** `.../ui/theme/Type.kt` (weights/sizes — keep readable, lift key numbers)
  and `.../ui/theme/Dimens.kt` (spacing/sizing/icon sizes). `Theme.kt` maps the roles.
- **Android screens:** `.../ui/screens/*` — enlarge quantity/number displays, enlarge icons,
  simplify. Reuse the shared components (`ui/components/*`).

## Hard don'ts
- No backend, schema, endpoint, DTO, or business-logic changes.
- Don't change what any screen does; don't add/remove features.
- Don't break RTL or switch the language away from Persian.
- Don't remove the voice confirm step, role gates, pagination, or any existing safety behavior.
- Numbers/codes/SKUs/barcodes stay LTR inside the RTL layout (correct as-is).

## Verify before finishing
- Web: `cd apps/web && npx tsc --noEmit` must be 0 errors; the app still builds.
- Android: `cd apps/android && ./gradlew assembleProdDebug` must succeed.
- Spot-check a few screens in both light and dark. Nothing functional should regress.

## Deliverable
A cohesive blue-and-white, minimal, information-forward redesign of both clients — consistent
tokens, bigger icons, and prominently large key numbers (especially stock quantity) — with all
existing functionality intact.
