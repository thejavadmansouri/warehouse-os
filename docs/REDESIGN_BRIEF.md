# Warehouse OS — UI/UX Redesign Brief (for an AI design/build agent)

You are redesigning the **visual appearance and UX** of Warehouse OS: a **Persian (Farsi),
right-to-left (RTL)** warehouse-management system for an Iranian **car-parts** warehouse.
Two clients share one backend: a **Next.js admin web panel** and a **Kotlin/Jetpack-Compose
Android operator app**. Redesign the look and interaction of BOTH. Do **not** change the
backend API, data model, or business rules (see "Hard constraints").

> Language note: this brief is in English for precision, but **every user-facing string is
> Persian and the entire UI is RTL**. Keep all existing Persian labels; do not translate the UI
> to English.

---

## 1. Product context & mission

The warehouse is disorganized; the goal is to **digitize it fast** with minimal typing. The
core worker loop on the floor is: **scan a shelf barcode → speak the item in Persian → the
system proposes a product → worker confirms → recorded**. The guiding principle is
**speed per worker-hour**: every extra tap or slow screen costs money. Elegance is secondary
to speed and correctness. A wrong stock number is worse than a missing feature.

Catalog scale: **~5,800 products today, growing**; location tree can reach **100,000+ nodes**.
Designs must stay fast and legible at that scale.

## 2. Users & roles

- **STAFF (warehouse worker)** — uses the **Android app** on the floor. Often gloved, in a
  hurry, variable lighting, possibly poor connectivity. Needs huge touch targets, minimal
  reading, instant feedback. Read-only in the web panel's sense; cannot modify structure.
- **MANAGER / ADMIN** — use the **web panel** at a desk. Review worker submissions, manage the
  catalog and the physical location tree, print barcode labels, run reports. Comfortable with
  dense tables but want clarity and speed.

## 3. Hard constraints (do NOT change)

- **RTL Persian throughout.** Fonts: Vazirmatn / IRANSans (Persian). Persian digits shown to
  users where natural; the system already normalizes Arabic↔Persian letters and Persian↔ASCII
  digits internally.
- **Backend API contracts, routes, and JSON shapes stay as-is.** This is a visual/UX redesign,
  not a re-architecture. (Endpoints: NestJS at `/auth`, `/products`, `/products/search`,
  `/locations`, `/location-types`, `/warehouses`, `/inventory*`, `/labels`, `/manager/review`,
  `/product-requests`, `/imports`, etc.)
- **Voice never auto-commits.** The worker flow is propose → **confirm** → queue for manager
  approval. Keep an explicit confirmation step; never silently write stock.
- **Location `code`/`barcode`/`path` are immutable** once created (printed on physical shelf
  labels). Editing UI must not offer to change them; retire via deactivate instead.
- **Manager-only** actions must remain gated (creating/deleting warehouses, locations, catalog).
- **Everything paginated / lazy** at scale — never render 5,800 products or 100k locations at once.
- Keep **light + dark themes**. Keep the brand accent (a warm **orange**), but you may modernize
  the full palette, spacing, typography scale, and component styling.

## 4. Current design system (starting point — improve it)

- Stack: Next.js App Router + TypeScript + **shadcn/ui** + Tailwind. Colors are CSS variables in
  OKLCH in `globals.css` (light + dark). Brand primary ≈ orange (hue ~44). Focus ring is a
  distinct blue (kept separate from the red destructive color on purpose — preserve that
  separation).
- Reusable primitives already exist: `PageHeader`, `Card`, `Badge`, `Button`, `Input`,
  `Select`, `Dialog`, `Table`, `LoadingState`/`EmptyState`/`ErrorState`, `LabelPrintDialog`.
  Redesign these consistently so all pages feel like one product.

## 5. Web admin panel — page inventory (redesign each)

Sidebar groups & routes (keep the information architecture, improve the visuals):

**Overview**
- `/admin` — **Dashboard**: KPI tiles (recent activity count, total stock, distinct items,
  product count) + a recent-activity feed + an activity trend chart. Make it scannable at a glance.

**Catalog**
- `/admin/products` — **Products**: paginated table (117 pages of 50), a **strong search box**
  (tokenized, order-independent, typo/synonym tolerant — search is a headline feature; make it
  prominent and fast-feeling with instant results), row actions (edit, delete, print label),
  multi-select + bulk label print, CSV export, "new product" dialog. Columns: name, SKU,
  part number, brand, vehicle model, sale price, status.
- `/admin/brands`, `/admin/vehicle-models`, `/admin/part-catalog` — reference-data tables with
  create/edit dialogs.

**Inventory**
- `/admin/inventory` — current stock + manual in/out.
- `/admin/inventory/logs` — audit ledger (who/when/what/where).
- `/admin/inventory-transfer` — move stock between locations.
- `/admin/inventory-count` — stock-count (انبارگردانی) sessions.
- `/admin/review` — **Manager review queue**: worker voice submissions awaiting approval. Each
  card shows worker, time, location, spoken text, matched product, **confidence % (color-coded
  green/amber/red)**, with product-override search, and **Approve / Reject (with reason)**. This
  is the manager's most-used screen — optimize it.
- `/admin/product-requests` — workers' "please add this new product" requests; approve/reject.

**Locations**
- `/admin/locations` — **visual hierarchical tree editor**: warehouses as roots →
  Floor→Row→Column→Box (flexible, levels can be skipped). Expand/collapse with lazy loading,
  inline `+` add at each node with fast repeated sibling creation, multi-select + bulk delete
  with safe-delete confirmation (empty = hard delete, has-history = deactivate), per-node and
  bulk barcode-label printing, barcode lookup jump. Must stay smooth at 100k nodes. (Recently
  built; refine the visual design and interaction polish.)
- `/admin/location-types` — define each warehouse's levels (name + depth).

**Tools**
- `/admin/voice-input` — live monitor of incoming voice entries.
- `/admin/imports` — Excel catalog import with preview → confirm.
- `/admin/users` — user & role management.

**Auth**
- `/login` — Persian login; also lets a new device set the backend server URL.

## 6. Cross-cutting UX requirements (web)

- One coherent design language across all pages (spacing grid, type scale, color usage, table
  style, form style, status colors, empty/loading/error states, confirm dialogs).
- **Search-forward**: the product/location search should feel like a core strength — fast,
  forgiving, well-ranked, with clear result feedback and counts.
- Dense but calm tables: sticky headers, clear row hover/selection, good number/RTL alignment,
  monospace for codes/SKUs/barcodes.
- Color-coded confidence and status everywhere they appear (consistent semantics).
- Full light/dark parity. Accessible contrast. Keyboard-friendly.
- Responsive down to a manager's tablet.

## 7. Android operator app — redesign (Kotlin + Jetpack Compose, Material 3, forced RTL)

Screens & the golden path (keep the flow, elevate the design for a fast, gloved, on-floor user):
**Startup → Login → Shift Home → Scan shelf (camera/QR + manual fallback) → Voice entry
(speak/type → processing → proposed product → confirm → success) → next item.** Plus:
**New-product request**, **Count/انبارگردانی**, **Settings** (server URL, connection test), and a
**pending-sync** indicator (offline-first: entries queue locally and sync for manager approval).

Redesign goals:
- Huge, unmistakable primary actions (record, confirm, next). Big touch targets (existing
  actions use 64–88dp — keep that generosity).
- A constant, obvious **status strip** showing the current step (Speak → Process → Confirm → Done).
- Instant, physical feedback: haptics on success, clear listening state, live partial transcript.
- Bulletproof states: mic/camera permission flows, offline/queued badge, connection errors with
  a recovery path (Settings must always be reachable, even before a shift starts).
- Multi-line item names (part names are long, e.g. "دیسک صفحه کلاچ پراید والئو") must never clip.
- Confirmation screen must clearly show product + quantity + unit before the worker commits.

## 8. What to deliver

1. A cohesive **design system**: color tokens (light+dark, OKLCH ok), type scale (Persian
   fonts), spacing, elevation, radius, iconography, and the core component set restyled
   (buttons, inputs, selects, tables, cards, badges, dialogs, tabs, toasts, empty/loading/error).
2. **High-fidelity redesigns** of every web page in §5 and every Android screen in §7, RTL, in
   both light and dark.
3. Reusable Compose components mirroring the web design language so the two clients feel like
   one product.
4. Rationale notes for major decisions, and any interaction specs (hover, selection, expand,
   inline-create, confirm flows).

## 9. Non-goals / don't break

- No backend, schema, endpoint, or business-rule changes.
- Don't remove the confirm step in voice, don't allow editing immutable location codes, don't
  ungate manager-only actions, don't render unbounded lists.
- Don't drop RTL or switch the UI language.
- Keep the orange brand accent and the blue (non-red) focus ring separation.

---

### Quick reference: primary user journeys to nail
1. **Worker logs an item** (Android): scan → speak → confirm → next, in seconds.
2. **Manager reviews & approves** (web `/admin/review`): scan the queue, judge confidence, fix
   match if needed, approve — fast and confident.
3. **Manager builds the warehouse** (web `/admin/locations`): create the physical tree quickly,
   print labels.
4. **Anyone finds a part** (web + Android): powerful, forgiving Persian search over ~5,800 parts.
