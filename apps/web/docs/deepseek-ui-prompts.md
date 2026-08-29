# پرامپت‌های دیپ‌سیک — بازطراحی UI صندوق

هر دو تکه **کاملاً نمایشی**‌اند: هیچ فراخوانی شبکه، هیچ استور، هیچ روتر.
ورودی props، خروجی JSX. بعد از دریافت، فایل مقصد را کامل جایگزین کن.

---

## ۱) `src/components/shortcuts-help.tsx` — راهنمای میان‌برها (F1)

````
You are writing ONE self-contained React component file for an existing
Next.js 15 + React 19 + TypeScript + Tailwind CSS v4 project. Output ONLY the
file content, no prose, no markdown fences.

FILE: src/components/shortcuts-help.tsx
FIRST LINE MUST BE: "use client";

GOAL
A full-screen keyboard-shortcut reference overlay for a Persian (RTL)
point-of-sale application used by shop clerks on Windows 10/11 in Chrome.
It is opened with F1 and closed with Esc. It is READ-ONLY: it renders data
it is given and calls onClose. It performs no data fetching.

EXACT PUBLIC API — do not change names or shapes:

  export interface ShortcutItem {
    keys: string;      // e.g. "F2", "Ctrl+Alt+↑", "↑↓"
    label: string;     // Persian description
    /** true = the most important shortcut in its group; render it emphasised */
    primary?: boolean;
  }

  export interface ShortcutGroup {
    title: string;             // Persian group heading
    items: ShortcutItem[];
  }

  export function ShortcutsHelp(props: {
    open: boolean;
    groups: ShortcutGroup[];
    onClose: () => void;
  }): React.ReactElement | null;

BEHAVIOUR
- Returns null when `open` is false.
- Renders a fixed, full-viewport overlay (`fixed inset-0 z-50`) with an opaque
  backdrop, centred on a card that never exceeds the viewport height and
  scrolls internally when it must.
- On mount (when open turns true) it focuses its own container so that key
  events land on it. Container has tabIndex={-1} and outline-none.
- Esc, F1 and Enter all call onClose. Clicking the backdrop calls onClose.
  Clicks inside the card must NOT close it.
- Add a `window` keydown listener while open so Esc/F1 work even if focus was
  stolen; remove it on close/unmount. Call e.preventDefault() for F1.
- No focus trap beyond focusing the container. No animation library.

LAYOUT & TYPOGRAPHY (this is the point of the component — a clerk must read it
from about a metre away, in a brightly lit shop)
- The whole document is already dir="rtl" and uses the Vazirmatn font. Do not
  set dir or font-family yourself.
- Groups laid out in a responsive grid: 1 column on small screens, 2 on md,
  3 on xl (`grid gap-6 md:grid-cols-2 xl:grid-cols-3`).
- Each group: a bold heading, then its items as rows.
- Each row: the key on the RIGHT (RTL start) inside a <kbd>, the Persian label
  filling the rest. Rows are generously tall (at least py-2) and separated by
  a hairline divider, never by heavy borders.
- <kbd> styling: fixed minimum width so keys line up in a column, monospace
  digits via `tabular-nums`, rounded, bordered, subtle background, bold.
- `primary` items: slightly larger text and a coloured key chip.
- Base text size no smaller than `text-base` for labels and `text-sm` for keys.

COLOURS — use ONLY these existing Tailwind theme tokens, never raw hex, never
Tailwind palette names like slate-500. They already adapt to light/dark:
  bg-background text-foreground
  bg-card text-card-foreground
  bg-muted text-muted-foreground
  bg-primary text-primary-foreground
  border-border  (as `border`)
  ring / focus-visible:ring-ring
For the backdrop use `bg-background/80 backdrop-blur-sm`.

HEADER & FOOTER
- Header: a Persian title "راهنمای کلیدها", and on the far side a small hint
  chip reading: Esc  بستن
- Footer: one muted line: "این راهنما با F1 باز و بسته می‌شود."

ICONS
You may import from "lucide-react" (already installed). Keyboard and X are
available. Keep icon usage minimal.

CONSTRAINTS
- TypeScript strict. No `any`. No default export.
- Do not import anything from "@/components/ui/*" — this file must stand alone
  with plain elements and Tailwind classes.
- Comments in Persian, and only where a choice is non-obvious. Do not narrate
  what the code plainly says.
````

---

## ۲) `src/app/admin/pos/_components/edit-diff-summary.tsx` — خلاصه‌ی «قبل ← بعد»

````
You are writing ONE self-contained React component file for an existing
Next.js 15 + React 19 + TypeScript + Tailwind CSS v4 project. Output ONLY the
file content, no prose, no markdown fences.

FILE: src/app/admin/pos/_components/edit-diff-summary.tsx
FIRST LINE MUST BE: "use client";

GOAL
A compact, read-only Persian (RTL) panel that shows what a shop clerk is about
to change on an already-issued sales invoice, as a before → after list, so
they can confirm it at a glance before pressing the confirm key. It fetches
nothing and mutates nothing.

EXACT PUBLIC API — do not change names or shapes:

  export interface EditDiffRow {
    productName: string;
    oldQuantity: number;
    newQuantity: number;
    oldUnitPrice: number;   // Iranian rial, integer
    newUnitPrice: number;   // Iranian rial, integer
    unit: string;           // Persian unit word, e.g. "عدد"
  }

  export function EditDiffSummary(props: {
    rows: EditDiffRow[];
    /** مجموع اثر مالی به ریال؛ مثبت = مشتری بدهکارتر می‌شود */
    netAdjust: number;
    /** شماره‌ی فاکتوری که اصلاح می‌شود */
    invoiceNumber: number;
  }): React.ReactElement;

FORMATTING — import these, do not reimplement them:
  import { money, toFa, qty } from "@/lib/format";
  money(n) -> grouped rial string;  toFa(n) -> Persian digits;  qty(n) -> quantity string.
All numbers rendered to the user must go through one of these three.

ROW RENDERING RULES
- A row where newQuantity === 0 is a REMOVAL: show the product name with a
  line-through, a "حذف" chip, and no arrow columns for price.
- Otherwise show, per row: product name (truncating, taking the free space),
  then a quantity cell and a price cell.
- A quantity or price cell whose old and new values are equal renders as a
  single muted value — no arrow. Only cells that actually changed render as
  «old → new», with the old value muted and struck through and the new value
  bold. In RTL the arrow that reads "becomes" is ← (U+2190).
- An increase is neutral-to-warning coloured, a decrease neutral-to-success
  coloured. Use the theme tokens named below, not red/green literals.
- Rows separated by hairline dividers. Minimum row height comfortable for
  reading at a distance: at least py-2 and text-base for the product name.

FOOTER
A single emphasised row: the label "اثر مالی این اصلاح" and the value
money(Math.abs(netAdjust)), prefixed with + when netAdjust > 0 and − (U+2212)
when negative, plus a short Persian clarifier:
  netAdjust > 0  -> "به بدهی مشتری اضافه می‌شود"
  netAdjust < 0  -> "از بدهی مشتری کم می‌شود"
  netAdjust === 0 -> "بدهی مشتری عوض نمی‌شود"

EMPTY STATE
If rows.length === 0, render a single muted centred line:
"چیزی تغییر نکرده" — and nothing else.

HEADER
One line: "اصلاح فاکتور " + toFa(invoiceNumber), bold, with a muted count
"‏{toFa(rows.length)} ردیف".

COLOURS — use ONLY these existing theme tokens, never raw hex, never Tailwind
palette names:
  bg-card text-card-foreground  bg-muted  text-muted-foreground
  text-success  text-warning  text-destructive
  border  (border-border)
  bg-primary text-primary-foreground

CONSTRAINTS
- TypeScript strict. No `any`. No default export. No state, no effects.
- Do not import from "@/components/ui/*".
- The component must be safe with 40 rows: it does not scroll itself, the
  parent handles that.
- Comments in Persian, only where a choice is non-obvious.
````
