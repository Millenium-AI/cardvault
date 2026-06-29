# Inventory Table — Chevron & Column Drag-and-Drop

## Part 1 — Remove the Chevron Column (`client/src/pages/Inventory.tsx`)

### What to change

The first column of the inventory list table is a dedicated `<th>` / `<td>` that only holds a chevron icon or a checkbox in select mode. Remove it entirely and fold its contents into the Card column.

**1A — Remove the standalone `<th>`**

In `<thead>`, delete this entire element:
```tsx
<th className="w-7 px-3 py-2.5">
  {selectMode && (
    <button onClick={...}>
      {/* checkbox */}
    </button>
  )}
</th>
```

**1B — Remove the standalone `<td>` in `InventoryRow`**

Delete this entire element:
```tsx
<td className="px-3 py-2.5 w-7" onClick={e => e.stopPropagation()}>
  {selectMode ? (
    <button onClick={() => onSelect(item.id, !selected)} ...>
      {selected ? <CheckSquare .../> : <Square .../>}
    </button>
  ) : (
    <ChevronDown size={13} className={`... ${expanded ? "" : "-rotate-90"}`} />
  )}
</td>
```

**1C — Move both into the Card `<td>`**

In the Card `<td>` (the one containing `productName` and `number`), prepend a small inline left element before the text block:

```tsx
<td className="px-3 py-2.5">
  <div className="flex items-center gap-2">
    {/* Chevron or checkbox — inline, not a separate column */}
    {selectMode ? (
      <button
        onClick={e => { e.stopPropagation(); onSelect(item.id, !selected); }}
        className="text-muted-foreground hover:text-primary transition-colors shrink-0"
      >
        {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
      </button>
    ) : (
      <ChevronDown
        size={13}
        className={`text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "" : "-rotate-90"}`}
      />
    )}
    {/* Existing text block */}
    <div>
      <div className="text-sm font-medium text-foreground truncate max-w-[300px]">{item.productName}</div>
      <div className="text-xs text-muted-foreground truncate max-w-[300px]">
        {item.number}{meta.sourceSetName ? ` · ${meta.sourceSetName}` : ""}
      </div>
    </div>
  </div>
</td>
```

**1D — Update the expanded detail row**

Change `colSpan={8}` to `colSpan={7}` on the expanded `<tr>`.

**1E — Update the `<thead>` select-all checkbox**

The `<th>` that held the select-all checkbox is now gone. Move the select-all checkbox logic into the Card `<th>` header cell, prepended inline before the "Card" label text — same pattern as 1C.

---

## Part 2 — Draggable Columns with Per-User Persistence

### Overview
- Install `@dnd-kit/core` and `@dnd-kit/sortable`
- Column order is saved per user in `app_settings` via two new API endpoints
- On mount the page fetches the saved order; on reorder it saves immediately
- The chevron/checkbox is now part of the Card cell and is NOT a draggable column
- All 7 data columns are draggable: Card, Condition, Game, Qty, Market $, Print $, Total

---

### Step 1 — New API routes (`server/routes.ts`)

Add these two routes after the existing `/api/dashboard/stats` route:

```ts
app.get("/api/settings/inventory-columns", async (req: any, res) => {
  try {
    const raw = await storage.getSetting(req.user.id, "inventory_column_order");
    const DEFAULT_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"];
    if (!raw) return res.json({ order: DEFAULT_ORDER });
    try {
      const parsed = JSON.parse(raw);
      // Ensure all default columns are present (handles new columns added later)
      const merged = [
        ...parsed.filter((c: string) => DEFAULT_ORDER.includes(c)),
        ...DEFAULT_ORDER.filter(c => !parsed.includes(c)),
      ];
      return res.json({ order: merged });
    } catch {
      return res.json({ order: DEFAULT_ORDER });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/settings/inventory-columns", async (req: any, res) => {
  try {
    const { order } = req.body as { order: string[] };
    if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });
    await storage.setSetting(req.user.id, "inventory_column_order", JSON.stringify(order));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

---

### Step 2 — Column definitions (`client/src/pages/Inventory.tsx`)

Add this constant at the top of the file, outside any component:

```ts
const DEFAULT_COLUMN_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"] as const;
type ColumnKey = typeof DEFAULT_COLUMN_ORDER[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  card:      "Card",
  condition: "Cond",
  game:      "Game",
  qty:       "Qty",
  market:    "Market $",
  print:     "Print $",
  total:     "Total",
};
```

---

### Step 3 — Fetch and save column order in `Inventory` component

Inside the `Inventory` component, add:

```ts
const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([...DEFAULT_COLUMN_ORDER]);

// Fetch saved order on mount
useEffect(() => {
  apiRequest("GET", "/api/settings/inventory-columns")
    .then(r => r.json())
    .then(d => { if (Array.isArray(d.order)) setColumnOrder(d.order as ColumnKey[]); })
    .catch(() => {});
}, []);

// Save order after drag
function handleColumnReorder(newOrder: ColumnKey[]) {
  setColumnOrder(newOrder);
  apiRequest("POST", "/api/settings/inventory-columns", { order: newOrder }).catch(() => {});
}
```

---

### Step 4 — Draggable column header (`client/src/pages/Inventory.tsx`)

Add this component near the top of the file (after imports):

```tsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function DraggableColHeader({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-grab active:cursor-grabbing select-none whitespace-nowrap"
      {...attributes}
      {...listeners}
    >
      {children}
    </th>
  );
}
```

---

### Step 5 — Wire up `<thead>` with DnD context

In the list view `<thead>`, replace the static `<tr>` with a drag-and-drop context:

```tsx
<thead>
  <DndContext
    sensors={useSensors(useSensor(PointerSensor))}
    collisionDetection={closestCenter}
    onDragEnd={(event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = columnOrder.indexOf(active.id as ColumnKey);
        const newIndex = columnOrder.indexOf(over.id as ColumnKey);
        handleColumnReorder(arrayMove(columnOrder, oldIndex, newIndex));
      }
    }}
  >
    <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
      <tr className="border-b border-border bg-muted/40">
        {/* Locked: select-all / expand indicator — not draggable */}
        <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground w-7">
          {selectMode && (
            <button onClick={selectedIds.size === sorted.length && sorted.length > 0 ? deselectAll : selectAll}
              className="text-muted-foreground hover:text-primary transition-colors">
              {selectedIds.size === sorted.length && sorted.length > 0
                ? <CheckSquare size={14} className="text-primary" />
                : someSelected ? <CheckSquare size={14} className="text-primary/50" /> : <Square size={14} />}
            </button>
          )}
        </th>
        {columnOrder.map(col => (
          <DraggableColHeader key={col} id={col}>
            {COLUMN_LABELS[col]}
          </DraggableColHeader>
        ))}
      </tr>
    </SortableContext>
  </DndContext>
</thead>
```

---

### Step 6 — Render `<tbody>` rows in column order

In `InventoryRow`, replace the hardcoded `<td>` sequence with a mapped render driven by `columnOrder`. Pass `columnOrder` as a prop:

```tsx
function InventoryRow({
  item, selected, onSelect, selectMode, columnOrder,
}: {
  item: any; selected: boolean; onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean; columnOrder: ColumnKey[];
}) {
```

Inside the row `<tr>`, after the fixed Card `<td>` (which now contains the chevron/checkbox per Part 1), render the remaining columns dynamically:

```tsx
{columnOrder.filter(col => col !== "card").map(col => {
  switch (col) {
    case "condition": return (
      <td key="condition" className="px-3 py-2.5 text-xs whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <ConditionBadge condition={item.condition} abbreviated />
          <LabelStatusBadge status={item.labelStatus} />
        </div>
      </td>
    );
    case "game": return (
      <td key="game" className="px-3 py-2.5 text-xs text-muted-foreground capitalize whitespace-nowrap">
        {item.game?.replace("-", " ")}
      </td>
    );
    case "qty": return (
      <td key="qty" className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className="text-sm font-mono font-medium text-foreground">{item.currentQuantity}</span>
      </td>
    );
    case "market": return (
      <td key="market" className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
      </td>
    );
    case "print": return (
      <td key="print" className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-sm font-mono font-semibold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
      </td>
    );
    case "total": return (
      <td key="total" className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className="text-sm font-mono text-muted-foreground">
          ${((item.currentRawMarketPrice || 0) * item.currentQuantity).toFixed(2)}
        </span>
      </td>
    );
    default: return null;
  }
})}
```

The Card column (`col === "card"`) is always rendered first as the fixed cell from Part 1 — it is excluded from the mapped render above.

Pass `columnOrder` down wherever `InventoryRow` is rendered:
```tsx
<InventoryRow key={item.id} item={item} selected={...} onSelect={...} selectMode={...} columnOrder={columnOrder} />
```

Also update `colSpan` on the expanded detail row to use `{columnOrder.length + 1}` (the +1 accounts for the fixed Card column).

---

### Step 7 — Install dependencies

Add to `package.json` dependencies:
```
"@dnd-kit/core": "^6.1.0",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

Run `npm install` after updating.

---

## What NOT to Change
- Do not touch grid view (`grid-sm`, `grid-lg`), `InventoryDetailSheet`, `BulkActionBar`, or `BulkActionBar`
- Do not modify any API query keys, mutations, or server logic outside the two new settings routes
- Do not add drag-and-drop to anything other than the list-mode column headers
- TypeScript only — no new `any` on added code
