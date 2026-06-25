# Design System — `vite-app`

Living reference for building new pages/components. Mirror the conventions in [`OffersPage`](src/pages/OffersPage.tsx) and [`ProfilePage`](src/pages/ProfilePage.tsx).

---

## Stack

- **React + Vite + TypeScript**
- **Tailwind CSS v4** (CSS-first config via `src/index.css` `@theme`)
- **shadcn/ui** — UI primitives live in [`src/components/ui/`](src/components/ui/). Built on **Radix** + **lucide-react** icons. Add new ones with `npx shadcn@latest add <name>` (run from `vite-app/`, has `components.json`).
- **react-router-dom** for routing.
- **framer-motion** for animation (Navbar header/exit transitions).

> Rule: prefer shadcn primitives over hand-rolled markup. Dropdowns/popovers/selects/dialogs MUST use the shared component in `src/components/ui/`, never raw `<div>` overlays or native `<select>`.

---

## Theme & Color Tokens

Defined in [`src/index.css`](src/index.css) as CSS vars, surfaced to Tailwind via `@theme inline`. **Both light (`:root`) and dark (`.dark`) define every token.** Always use token classes — never hardcode hex/oklch in markup.

| Token class        | Use                                  |
| ------------------ | ------------------------------------ |
| `bg-background`    | page background                      |
| `bg-card`          | cards / elevated surfaces            |
| `bg-popover`       | dropdown / popover / menu content    |
| `bg-muted`         | table header bg, hover, inactive UI  |
| `bg-primary`       | primary CTA fills                    |
| `text-foreground`  | default text                         |
| `text-muted-foreground` | labels, secondary text, helper  |
| `text-primary`     | links / emphasis                     |
| `border-border`    | borders (often `border-border/50`)   |
| `bg-accent` / `text-accent-foreground` | hover/focus fill on items |

- **Accent (lime):** `--primary: #C8F31E` (dark mode). Used for primary CTAs, active states, and links.
- **Radius scale** auto-derived from `--radius: 0.75rem` (`rounded-md`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`).
- Background has layered radial gradients (light pastels / dark jewel tones) baked into `body` — keep surfaces semi-transparent over it (`bg-card/70`, `bg-background/50`) for the glass feel.

---

## Layout & Spacing

- App shell: [`AppLayout`](src/components/layout/AppLayout.tsx) → wraps each page in [`PageContainer`](src/components/layout/PageContainer.tsx) `type="app"`: `max-w-[1000px] mx-auto px-4 md:px-6 py-8 w-full`. **The `py-8` top/bottom padding is already applied here — do NOT add `py-8`/`mt-8`/`mb-8` on the page root.** Pages render inside this; do NOT add another outer `max-w`/centering wrapper.
- **Page root:** bare `<section className="space-y-8">` (no padding). Only narrow centered content (forms, detail cards) wraps in an inner `<div className="max-w-xl mx-auto space-y-N">` — header included so its back button aligns to that column.
- **Page header:** use [`AppPageHeader`](src/components/custom/AppPageHeader.tsx) — do NOT hand-roll header markup. Two variants:
  - `variant="split"` — title + subtitle left, optional `action` node right (list pages, e.g. OffersPage):
    ```tsx
    <AppPageHeader
      title="Offers"
      subtitle="Browse and create trade offers"
      variant="split"
      action={<Button className="rounded-full shadow-none">Create Offer</Button>}
    />
    ```
  - `variant="centered"` — back button left, title + subtitle absolutely centered (detail/form pages, e.g. TradePage, CreateOfferPage, EditProfilePage). Place it INSIDE the `max-w-xl` column so the back button indents to the column, not flush to the viewport:
    ```tsx
    <AppPageHeader
      title="Title"
      subtitle="subtitle"
      variant="centered"
      onBack={() => navigate(-1)}
    />
    ```
- **Section gaps:** `space-y-8` between major sections; `gap-4` in grids; `gap-3` between inline controls.
- **Responsive:** mobile-first. `flex-col md:flex-row`, `grid-cols-1 md:grid-cols-2`.

---

## Typography — `<Text>`

[`src/components/ui/text.tsx`](src/components/ui/text.tsx). Single component, `variant` prop, optional `as`.

| variant   | class                                            | use              |
| --------- | ------------------------------------------------ | ---------------- |
| `h1`      | `text-4xl font-extrabold tracking-tight`         | landing hero     |
| `h2`      | `text-3xl font-semibold border-b pb-2`           | profile name     |
| `h3`      | `text-2xl font-semibold tracking-tight`          | page title       |
| `h4`      | `text-xl font-semibold tracking-tight`           | card/section title |
| `subtitle`| `text-lg text-muted-foreground`                  |                  |
| `body`    | `leading-7`                                      | paragraphs       |
| `muted`   | `text-sm text-muted-foreground`                  | helper/subtitle  |
| `small`   | `text-sm font-medium leading-none`               | labels, eyebrows |

Default `variant="body"`.

---

## Components

### Button
- Variants: `default` (primary lime), `outline`, `secondary`, `destructive`, `ghost`.
- **Pill CTAs:** `className="rounded-full shadow-none"` (offers/actions).
- Sizes: `default`, `sm`, `lg`, `icon`.

### Cards (`Card` / `CardContent`)
- Bento-style stat boxes (ProfilePage): grid `md:grid-cols-2 gap-4`, two columns each `flex flex-col gap-4`.
- Stat card pattern: eyebrow label (`variant="small" uppercase tracking-wider text-muted-foreground`) + big value (`variant="h3"`).
- Key-value rows inside cards: `<div className="flex justify-between"><span className="text-muted-foreground">Label</span><span>Value</span></div>`, grouped in `space-y-3`.

### Tables
[`src/components/ui/table.tsx`](src/components/ui/table.tsx) + [`OffersTableWrapper`](src/components/custom/OffersTableWrapper.tsx).
- Header row: `border-b border-border/50 bg-muted/50 -mx-6 md:-mx-8 px-6 md:px-8` (negative margins bleed to wrapper edges).
- Body rows: `hover:bg-muted/50 transition-colors border-b border-border/50`.
- Numeric cells: `text-right font-mono`. Index column: `text-muted-foreground font-mono`.
- Trader cell: `Avatar` (h-8 w-8) + mono address (`0x1234…abcd`) + `text-xs text-muted-foreground` subtext.
- Sortable header: `<button className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">` with `<ArrowUpDown>` icon (active = `text-foreground`, idle = `text-muted-foreground/50`).
- Infinite list: `MaskedList` + `useInfiniteList` from [`src/components/infinite-list`](src/components/infinite-list).

### Badges
- `variant="default"` for buy/active, `"secondary"` for sell. Always `className="rounded-full"`.
- Status badge (e.g. "Online"): custom `bg-green-500 text-white hover:bg-green-600`.

### Dropdowns / Filters
**Default to [`FullDropdown`](src/components/custom/FullDropdown.tsx)** for all filter/selector dropdowns going forward. One reusable component over hand-assembling `DropdownMenu*` each time. Pill trigger (`label: value` + rotating `ChevronDown`), `cursor-pointer` items, `Check` on active option:
```tsx
<FullDropdown
  label="Type"
  value={typeFilter}
  onSelect={setTypeFilter}
  options={[
    { label: 'All', value: 'all' },
    { label: 'Buy', value: 'buy' },
    { label: 'Sell', value: 'sell' },
  ]}
/>
```
- Props: `label`, `value`, `options: {label, value, icon?}[]`, `onSelect`, optional `icon` (trigger), `align`, `sideOffset`.
- Items are `cursor-pointer`, hover = `bg-accent`, active option shows `<Check>`.
- Reach for the raw [`dropdown-menu.tsx`](src/components/ui/dropdown-menu.tsx) primitives only when `FullDropdown` can't express the layout (separators, submenus, multi-group menus like the Navbar profile menu). Then use `onSelect` on items and `asChild`+`<a>` for links.

### Inputs
Pill search: `<Input className="max-w-xs rounded-full border-border" />`. Pill number inputs: `rounded-full border border-border`.

---

## Iconography

- **lucide-react** exclusively. Size via `className="w-4 h-4"` (icons inside items) or `w-3.5 h-3.5` (inline indicators).

---

## Building a new page — checklist

1. Wrap in `AppLayout` route (see [`App.tsx`](src/App.tsx)). No manual `max-w` container.
2. Root `<section className="space-y-8">` — **no `py-8`**, padding comes from `PageContainer`.
3. Header via [`AppPageHeader`](src/components/custom/AppPageHeader.tsx) — `variant="split"` for list pages, `variant="centered"` for detail/form pages.
4. Use `Text`, `Button`, `Card`, `Table`, `Badge` from `components/ui/` — no raw equivalents.
5. Dropdowns: [`FullDropdown`](src/components/custom/FullDropdown.tsx) by default (raw `DropdownMenu*` only when FullDropdown can't fit).
6. Color = tokens only. Radius = `rounded-2xl` cards, `rounded-full` buttons/badges/inputs, `rounded-xl` rows.
7. Mono font for addresses/numbers (`font-mono`).
8. Verify in both light and dark (toggle `.dark`).
