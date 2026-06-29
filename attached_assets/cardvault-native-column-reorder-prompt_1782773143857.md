# Card Vault Inventory — Simple Native Column Reordering

Implement a very simple left/right drag-and-drop reorder for the Inventory table columns, with per-user persistence. Remove the `@dnd-kit` dependency and use native HTML5 drag-and-drop only.

## Goals
- Users can drag a table header left or right to reorder columns.
- The reordered column layout is saved per user.
- On next login, the same user sees their saved column order.
- A different user gets their own saved order.
- Keep the current row/cell rendering aligned by using the same `columnOrder` array for both headers and cells.
- Do not add any extra drag-and-drop packages.

## Important constraints
- Keep the implementation simple.
- No `@dnd-kit/core`, `@dnd-kit/sortable`, or `@dnd-kit/utilities`.
- Use only React state + native HTML drag-and-drop events.
- Do not change grid views.
- Keep the existing chevron/expand behavior as-is for now.
- Keep the same per-user settings storage using `app_settings`.

## Step 1 — Remove the DnD dependencies

Update `package.json` and remove these dependencies if they exist:
- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

Then update the lockfile accordingly.

## Step 2 — Keep column order state

In `client/src/pages/Inventory.tsx`, keep a `columnOrder` state array like this:

```ts
const DEFAULT_COLUMN_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"] as const;
type ColumnKey = typeof DEFAULT_COLUMN_ORDER[number];
```

Keep the current labels map:

```ts
const COLUMN_LABELS: Record<ColumnKey, string> = {
  card: "Card",
  condition: "Cond",
  game: "Game",
  qty: "Qty",
  market: "Market $",
  print: "Print $",
  total: "Total",
};
```

Then keep this state in the component:

```ts
const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([...DEFAULT_COLUMN_ORDER]);
```

## Step 3 — Load and save user preference

Keep the existing settings routes, or add them if needed:

- `GET /api/settings/inventory-columns`
- `POST /api/settings/inventory-columns`

Use the existing `storage.getSetting(userId, "inventory_column_order")` and `storage.setSetting(...)` helpers.

Behavior:
- On mount, fetch the saved column order.
- If nothing is saved, use the default order.
- When the order changes, save it immediately for the current user.

Use a small helper to merge saved columns with defaults so new columns added later still appear.

Example logic:

```ts
function mergeColumnOrder(saved: string[] | undefined): ColumnKey[] {
  const base = [...DEFAULT_COLUMN_ORDER];
  if (!Array.isArray(saved)) return base;
  const filtered = saved.filter((c): c is ColumnKey => base.includes(c as ColumnKey));
  const missing = base.filter(c => !filtered.includes(c));
  return [...filtered, ...missing];
}
```

## Step 4 — Native drag-and-drop headers

Replace the current draggable header implementation with a simple native drag header component.

Create a component like this:

```tsx
function DraggableColHeader({
  id,
  children,
  onMove,
}: {
  id: ColumnKey;
  children: React.ReactNode;
  onMove: (dragged: ColumnKey, target: ColumnKey) => void;
}) {
  return (
    <th
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const dragged = e.dataTransfer.getData("text/plain") as ColumnKey;
        if (dragged && dragged !== id) onMove(dragged, id);
      }}
      className="px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-grab active:cursor-grabbing select-none whitespace-nowrap"
    >
      {children}
    </th>
  );
}
```

No overlay, no sorting strategy, no sensors, no sortable context.

## Step 5 — Reorder helper

Inside `Inventory.tsx`, add a helper to move a column in the array:

```ts
function moveColumn(order: ColumnKey[], from: ColumnKey, to: ColumnKey): ColumnKey[] {
  const next = [...order];
  const fromIndex = next.indexOf(from);
  const toIndex = next.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}
```

Then use it in the reorder handler:

```ts
function handleColumnMove(dragged: ColumnKey, target: ColumnKey) {
  const next = moveColumn(columnOrder, dragged, target);
  setColumnOrder(next);
  apiRequest("POST", "/api/settings/inventory-columns", { order: next }).catch(() => {});
}
```

## Step 6 — Render headers from the order array

In the list view table header, map the columns from `columnOrder`.

Keep the header row inside a normal `<thead><tr>...</tr></thead>` structure.

Example:

```tsx
<thead>
  <tr className="border-b border-border bg-muted/40">
    {columnOrder.map((col) => (
      <DraggableColHeader key={col} id={col} onMove={handleColumnMove}>
        {col === "card" ? (
          <div className="flex items-center gap-2">
            {selectMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  (selectedIds.size === sorted.length && sorted.length > 0 ? deselectAll : selectAll)();
                }}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                {selectedIds.size === sorted.length && sorted.length > 0
                  ? <CheckSquare size={14} className="text-primary" />
                  : someSelected ? <CheckSquare size={14} className="text-primary/50" /> : <Square size={14} />}
              </button>
            )}
            {COLUMN_LABELS.card}
          </div>
        ) : (
          COLUMN_LABELS[col]
        )}
      </DraggableColHeader>
    ))}
  </tr>
</thead>
```

## Step 7 — Render row cells from the same array

In `InventoryRow`, keep the same `columnOrder` prop and render cells by mapping the array.

Important: the row must use the same `columnOrder` as the header so the table stays aligned automatically.

Example pattern:

```tsx
<tr ...>
  {columnOrder.map((col) => renderCell(col))}
</tr>
```

Where `renderCell(col)` returns the correct `<td>` for that column.

Keep the `card` cell first in the order map, and render the card content inside it. The other columns should match the existing behavior for condition, game, qty, market, print, and total.

## Step 8 — Expanded row colspan

Update the expanded detail row colspan to match the current number of visible columns.

If the row renders exactly the `columnOrder.length` cells, use:

```tsx
<td colSpan={columnOrder.length} ...>
```

## Step 9 — Remove old DnD imports and code

Delete these imports if they exist:
- `DndContext`
- `closestCenter`
- `PointerSensor`
- `useSensor`
- `useSensors`
- `SortableContext`
- `horizontalListSortingStrategy`
- `useSortable`
- `arrayMove`
- `CSS`

Also remove any `DraggableColHeader` implementation that depends on those packages.

## Step 10 — Keep the rest unchanged

Do not change:
- grid mode
- detail sheet behavior
- bulk edit behavior
- search/filter behavior
- inventory data fetching
- settings storage structure beyond column order

## Final behavior

After this change:
- The user can drag a header left or right.
- The table updates immediately.
- The new order is saved per user.
- The same user sees the same order later.
- Another user can customize their own order independently.

This should be a straightforward native implementation with no extra dependency risk.
