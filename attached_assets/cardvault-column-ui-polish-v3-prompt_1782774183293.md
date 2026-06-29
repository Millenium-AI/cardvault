# Inventory List View — Column UI Polish (v3)

Apply the following targeted changes to `client/src/pages/Inventory.tsx`. Make only these changes — do not refactor or move anything else.

---

## Change 1 — Column dividers on headers

In `DraggableColHeader`, update the `<th>` className to add a right border and `group` class:

```tsx
className="group px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-grab active:cursor-grabbing select-none whitespace-nowrap border-r border-border/40 last:border-r-0"
```

---

## Change 2 — Drag grip dots in each header

Wrap the `{children}` inside `DraggableColHeader` with a flex container that prepends a 2×3 dot grip:

```tsx
<th ...className above...>
  <div className="flex items-center gap-1.5">
    <div className="flex flex-col gap-[3px] opacity-25 group-hover:opacity-60 transition-opacity shrink-0">
      <div className="flex gap-[3px]">
        <div className="w-[3px] h-[3px] rounded-full bg-current" />
        <div className="w-[3px] h-[3px] rounded-full bg-current" />
      </div>
      <div className="flex gap-[3px]">
        <div className="w-[3px] h-[3px] rounded-full bg-current" />
        <div className="w-[3px] h-[3px] rounded-full bg-current" />
      </div>
      <div className="flex gap-[3px]">
        <div className="w-[3px] h-[3px] rounded-full bg-current" />
        <div className="w-[3px] h-[3px] rounded-full bg-current" />
      </div>
    </div>
    <span>{children}</span>
  </div>
</th>
```

---

## Change 3 — Rename "Card" column label to "Card Name"

In `COLUMN_LABELS`, update the `card` entry:

```ts
const COLUMN_LABELS: Record<ColumnKey, string> = {
  card:      "Card Name",
  condition: "Cond",
  game:      "Game",
  qty:       "Qty",
  market:    "Market $",
  print:     "Print $",
  total:     "Total",
};
```

---

## Change 4 — Column alignment: Card Name left, all others centered

### Headers

In the list view `<thead>` header row, when rendering column headers:

- `card` column: left-aligned (already the default, no change needed)
- All other columns (`condition`, `game`, `qty`, `market`, `print`, `total`): wrap the label in a centered block:

```tsx
<span className="w-full text-center block">
  {COLUMN_LABELS[col]}
</span>
```

Apply this only to the non-card branch of the column map in the header.

### Cells

In `renderCell` inside `InventoryRow`, update each `<td>` as follows:

- `case "card"`: left-aligned — keep as-is (text-left is default)
- `case "condition"`: `text-center`
- `case "game"`: `text-center`
- `case "qty"`: `text-center`
- `case "market"`: `text-center`
- `case "print"`: `text-center`
- `case "total"`: `text-center`

Full updated cell classNames per case:

- `case "card"`: `<td key="card" className="px-3 py-2.5 border-r border-border/40">`
- `case "condition"`: `<td key="condition" className="px-3 py-2.5 text-xs whitespace-nowrap text-center border-r border-border/40">`
- `case "game"`: `<td key="game" className="px-3 py-2.5 text-xs text-muted-foreground capitalize whitespace-nowrap text-center border-r border-border/40">`
- `case "qty"`: `<td key="qty" className="px-3 py-2.5 text-center whitespace-nowrap border-r border-border/40">`
- `case "market"`: `<td key="market" className="px-3 py-2.5 text-center whitespace-nowrap border-r border-border/40">`
- `case "print"`: `<td key="print" className="px-3 py-2.5 text-center whitespace-nowrap border-r border-border/40">`
- `case "total"`: `<td key="total" className="px-3 py-2.5 text-center whitespace-nowrap">` (no right border — last column)

---

## Change 5 — Column dividers on cells

Already covered in Change 4 above — each case has `border-r border-border/40`, except `total` which is the last column and gets no right border.

---

## Change 6 — Move LabelStatusBadge to line 2 of the card cell

In `renderCell`, `case "card"`, replace the current line 2 div:

```tsx
<div className="text-xs text-muted-foreground truncate max-w-[280px]">
  {item.number}{meta.sourceSetName ? ` · ${meta.sourceSetName}` : ""}
</div>
```

With:

```tsx
<div className="flex items-center gap-1.5 mt-0.5">
  {(item.number || meta.sourceSetName) && (
    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
      {item.number}{meta.sourceSetName ? ` · ${meta.sourceSetName}` : ""}
    </span>
  )}
  <LabelStatusBadge status={item.labelStatus} />
</div>
```

---

## Change 7 — Remove LabelStatusBadge from the condition cell

In `renderCell`, `case "condition"`, replace:

```tsx
<div className="flex items-center gap-1.5">
  <ConditionBadge condition={item.condition} abbreviated />
  <LabelStatusBadge status={item.labelStatus} />
</div>
```

With:

```tsx
<ConditionBadge condition={item.condition} abbreviated />
```

---

## Do NOT change
- Grid views
- `InventoryDetailSheet`
- `BulkActionBar`
- Filters, search, export
- Settings API calls
- Any other component
