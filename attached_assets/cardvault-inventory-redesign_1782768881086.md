# CardVault Inventory UI Redesign — Full Spec

## Context
This is `client/src/pages/Inventory.tsx` in a React + TypeScript + Tailwind + shadcn/ui project. The current inventory page has a game tile picker that gates the whole page, a single view mode (table on desktop, card stack on mobile), and a bulk mode that only supports delete. We are doing a full redesign. Do not change any API calls, query keys, mutation logic, or backend types. Only the UI/UX layer changes.

---

## Change 1 — Remove the Game Tile Gate

**Remove entirely:**
- The `if (selectedGame === null)` early return that renders `<GameTileGrid>`
- The sticky `← Games` back button header
- The `GAME_IMAGES` constant
- The `GameTileGrid` import

**Replace with:**
- On page load, default `game` state to `"all"` — inventory loads immediately
- The existing Game `<Select>` filter in the filter bar becomes the sole game selector
- Keep `useGameParam` for URL state persistence (`?game=pokemon` deep linking still works)

---

## Change 2 — Three View Modes

Add a `viewMode` state typed as `"list" | "grid-sm" | "grid-lg"`. Persist it to `localStorage` so it survives page refresh.

**Toggle UI:** A segmented icon button group in the top toolbar (right side, near Export). Use these lucide-react icons:
- `LayoutList` → List mode
- `LayoutGrid` → Small grid
- `Grid2X2` → Large grid

Active state: `bg-primary/15 text-primary border-primary/40`. Inactive: `text-muted-foreground border-border`.

---

### View Mode: `list`
- Full-width rows, **no card image rendered at all**
- Columns: `[chevron/checkbox] | Name + Set | Condition | Game | Qty | Market $ | Print $ | Total`
- Maximum density — same as the current desktop `<table>` but cleaned up
- Row click expands inline (see Change 4)

### View Mode: `grid-sm`
- Responsive grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
- Each card: small thumbnail image (~56px wide, card aspect ratio), name (1 line truncated), condition badge, market price, print price
- Click opens slide-over Sheet (see Change 4)

### View Mode: `grid-lg`
- Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Each card: larger image (~120px wide), full name (2 lines), set name, condition badge, game tag, qty, market + print price
- Click opens slide-over Sheet (see Change 4)

---

## Change 3 — Redesigned Toolbar Layout

Replace the current jumbled single-row filter area with a **3-row stacked layout**:

**Row 1 — Page Header**
```
Inventory                    [X SKUs · Y units · $Z.ZZ]
```

**Row 2 — Search + Filters**
```
[🔍 Search cards…] [Game ▾] [Condition ▾] [Sort ▾]
```
All same height (`h-9`). Search bar takes `flex-1`. Dropdowns are fixed width.

**Row 3 — Label Pills + View Toggle + Export**
```
[All 42] [Needs Label 5] [Needs Repricing 3] [Label Created 34]    [≡] [⊞] [⊟]  [Export Labels ▾]
```
Label filter pills on the left. View mode toggle group center-right. Export button far right.

---

## Change 4 — Expanded Detail

### List mode (inline expansion)
- Keep the current expand-on-click row behavior
- Replace hard mount/unmount with a **CSS max-height transition**: `transition-all duration-200 ease-in-out`
- The expanded `<tr>` colSpan row animates open smoothly

### Grid modes (slide-over Sheet)
- Use shadcn `<Sheet side="right">` — width `max-w-sm` on mobile, `max-w-md` on desktop
- Sheet content layout top to bottom:
  1. Card image (full width, object-contain, rounded-lg, max-h-48)
  2. Card name (lg font, semibold)
  3. Set · Printing · Rarity chips (same `<Chip>` component)
  4. Condition badge + Game tag inline
  5. Qty / Market / Print price row (3 columns, same style as current)
  6. `<PriceHistory>` component (unchanged)
  7. Notes (if present)
  8. **TCGplayer button** — full-width outlined button: `View on TCGplayer ↗` with `ExternalLink` icon. Only render if `item.tcgplayerUrl` exists. Opens in new tab.
  9. Action buttons row: `[✏ Edit item]` `[🗑 Delete]`
  10. When edit is active, `<InlineEditPanel>` replaces the action row (unchanged component)

---

## Change 5 — Bulk Edit Upgrades

**Selection behavior** stays the same (checkbox per row/card, select all).

Replace the current bulk toolbar (delete-only) with a **floating action bar** that slides up from the bottom of the viewport when `selectMode === true && selectedIds.size > 0`. Use `fixed bottom-4 left-1/2 -translate-x-1/2` positioning with a `rounded-2xl border border-border bg-card shadow-xl px-4 py-2.5` container. Animate in with `animate-in slide-in-from-bottom-2 duration-200`.

**Toolbar contents (left to right):**
1. **Selected count** — `"{N} selected"` in `text-xs text-muted-foreground`
2. **Bulk Condition** — `<Select>` dropdown, placeholder `"Set condition…"`, options: NM / LP / MP / HP / DMG. On change, fires `PATCH /api/inventory/bulk` with `{ ids, condition }`
3. **Bulk Quantity** — labeled `"Set qty"`, a small `<Input type="number" min="0">` (~60px wide) + a confirm `<Button>` (`"Apply"`). On apply, fires `PATCH /api/inventory/bulk` with `{ ids, currentQuantity }`
4. **Bulk Delete** — destructive button, `text-red-400`, same behavior as current but styled as a ghost/outline destructive. Confirm before firing.
5. **Cancel** — `X` ghost button, exits select mode

**Existing bulk toolbar above the list (the inline one) should be removed** — the floating bar replaces it entirely.

> Note: Verify that `PATCH /api/inventory/bulk` supports `condition` and `currentQuantity` fields server-side. If the endpoint only supports `ids` for delete today, a companion server change may be needed — flag this to the developer.

---

## Change 6 — TCGplayer Link (audit)

In the current code the TCGplayer link exists as a tiny circular icon-only button inside the chip cluster in `ExpandedDetail`. This is easy to miss and not accessible. Changes:

- **Remove** the circular icon button from the chip row
- **Add** a proper full-width (or auto-width) outlined button at the bottom of the detail panel as described in Change 4
- Label: `"View on TCGplayer"` with `ExternalLink size={14}` icon on the right
- `target="_blank" rel="noopener noreferrer"`
- Only render when `item.tcgplayerUrl` is truthy

---

## Components to Create

| Component | Description |
|---|---|
| `InventoryGridCard` | Shared card for both grid modes. Accepts `size: "sm" \| "lg"` prop. Handles select mode checkbox overlay. |
| `InventoryDetailSheet` | shadcn Sheet wrapper for grid mode expanded detail. Accepts `item`, `open`, `onClose`. |
| `BulkActionBar` | Fixed floating bar. Accepts `selectedIds`, `onCondition`, `onQuantity`, `onDelete`, `onCancel`. |
| `ViewModeToggle` | 3-button segmented control. Accepts `value`, `onChange`. |

---

## What NOT to Change
- `PriceHistory` component — leave as-is
- `InlineEditPanel` component — leave as-is
- `ExpandedDetail` logic/mutations — only move/reskin, don't rewrite
- `LabelStatusBadge` and `ConditionBadge` — leave as-is
- All API calls, query keys, mutation functions
- The label status filter pills logic
- Export Labels dropdown — leave as-is, just reposition per toolbar layout

---

## Tech Stack Reminders
- Tailwind CSS for all styling
- shadcn/ui components: `Sheet`, `Select`, `Input`, `Button`, `Skeleton`, `Textarea`
- lucide-react for icons
- `@tanstack/react-query` for all data fetching/mutations
- TypeScript throughout — no `any` shortcuts on new code
