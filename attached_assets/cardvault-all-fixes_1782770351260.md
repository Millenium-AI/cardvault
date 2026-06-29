# CardVault — Bug Fixes & Feature Patches

## Overview
Four targeted fixes across two files. Do not rewrite entire files. Do not touch unrelated logic, queries, or UI.

---

## Fix 1 — TCGplayer URL Not Building (Server · `server/routes.ts`)

### Root Cause
In `GET /api/inventory`, the server builds the TCGplayer URL by checking only `meta.sourceProductId` from `matchMetadataJson`. However, TCGplayer CSV exports sometimes name the column `"TCGplayer Id"` instead of `"Product ID"`, so `sourceProductId` ends up `null` for many items. The URL is never constructed, `tcgplayerUrl` is `null`, and the frontend silently hides the button.

The `sourceTcgplayerId` field is already parsed and stored correctly — it is just never used for URL construction.

### Change
In `GET /api/inventory` inside `routes.ts`, find this block:

```ts
// CURRENT
if (meta.sourceProductId) tcgplayerUrl = `https://www.tcgplayer.com/product/${meta.sourceProductId}`;
```

Replace with:

```ts
// FIXED
if (meta.sourceProductId) {
  tcgplayerUrl = `https://www.tcgplayer.com/product/${meta.sourceProductId}`;
} else if (meta.sourceTcgplayerId) {
  tcgplayerUrl = `https://www.tcgplayer.com/product/${meta.sourceTcgplayerId}`;
}
```

No other changes to `routes.ts`.

---

## Fix 2 — TCGplayer Button Not Visible in Any View (Frontend · `client/src/pages/Inventory.tsx`)

### Root Cause
The button is wrapped in `{item.tcgplayerUrl && !editing && (...)}`. When `tcgplayerUrl` is null/undefined, the button disappears entirely with no indication it should exist. This affects all three view modes.

### Changes

**2A — `ExpandedDetail` component (List mode)**

Remove the conditional wrapper. Always render the TCGplayer button. Place it **below** the Edit/Delete action row. Apply blue styling when a URL exists, disabled/muted styling when it does not.

```tsx
// Replace the existing conditional TCGplayer anchor with this:
<div className="flex items-center gap-2 pt-0.5">
  <Button
    data-testid="button-edit-item"
    variant="outline"
    size="sm"
    className="h-8 text-xs gap-1.5"
    onClick={e => { e.stopPropagation(); setEditing(true); }}
  >
    <Pencil size={12} /> Edit item
  </Button>
  <Button
    data-testid="button-delete-item"
    variant="outline"
    size="sm"
    disabled={deleteMut.isPending}
    className="h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
    onClick={handleDelete}
  >
    <Trash2 size={12} /> {deleteMut.isPending ? "Deleting…" : "Delete"}
  </Button>
</div>

{/* TCGplayer button — always visible */}
{item.tcgplayerUrl ? (
  <a
    href={item.tcgplayerUrl}
    target="_blank"
    rel="noopener noreferrer"
    onClick={e => e.stopPropagation()}
    className="flex items-center justify-center gap-1.5 w-full rounded-md border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors mt-2"
  >
    View on TCGplayer <ExternalLink size={12} />
  </a>
) : (
  <div className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed mt-2">
    View on TCGplayer <ExternalLink size={12} />
  </div>
)}
```

**2B — `InventoryDetailSheet` component (Grid modes)**

Apply the same always-visible pattern at the bottom of the sheet content, below the Edit/Delete row. Same blue/disabled styling as above.

**2C — Debug log**

Add this line inside `ExpandedDetail` directly above the `return` statement. Leave it in — it will be removed after the developer confirms the data is present:

```ts
console.log("tcgplayerUrl:", item.tcgplayerUrl, "| id:", item.id);
```

---

## Fix 3 — "Label Created" Tag Never Shows on Cards (Frontend · `client/src/pages/Inventory.tsx`)

### Root Cause
The `LabelStatusBadge` component has a hardcoded early return that explicitly suppresses the green `label_created` badge:

```tsx
// CURRENT — broken
function LabelStatusBadge({ status }: { status?: string }) {
  if (!status || status === "label_created") return null;  // ← this kills it
  ...
}
```

The `LABEL_STATUS_CONFIG` already has a correct green entry for `label_created` — it is just never reached.

### Change
Remove `status === "label_created"` from the early return condition:

```tsx
// FIXED
function LabelStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = LABEL_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${cfg.className}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}
```

This single change makes `label_created` badges appear everywhere `LabelStatusBadge` is used: list rows, small grid cards, large grid cards, and the detail sheet.

---

## Fix 4 — Merge Screen Search Not Clearly Working (Frontend · `client/src/pages/Uploads.tsx`)

### Root Cause
The `applySearch` function already searches `productName`, `number`, and `condition` correctly. However:
1. The search result count badge only appears when `sort !== "name"` OR `search.trim()` is set — meaning it can be invisible even while searching
2. The placeholder text is vague

### Changes

**4A — Search placeholder**

In `ReviewFilterBar`, update the input placeholder from:
```
"Search name, #, condition…"
```
to:
```
"Search by name, card #, or condition…"
```

**4B — Result count badge**

Change the condition that controls visibility of the `{totalVisible}/{totalAll}` count from:

```tsx
// CURRENT — count only shows when sort changed OR search active
{(search.trim() || sort !== "name") && (
  <span ...>{totalVisible}/{totalAll}</span>
)}
```

to:

```tsx
// FIXED — count only shows when search is active
{search.trim() && (
  <span ...>{totalVisible}/{totalAll}</span>
)}
```

**4C — Confirm all four sections apply search**

Verify that every `useMemo` block in `ReviewDetail` passes `search` into `applySearch`. The four blocks are `newItemsProcessed`, `matchedChanged`, `matchedUnchanged`, and `repricingProcessed`. If any is missing `applySearch(...)`, add it. The current code appears correct — this is a confirm-only check.

---

## Files Changed Summary

| File | Changes |
|---|---|
| `server/routes.ts` | Fix 1 — TCGplayer URL fallback to `sourceTcgplayerId` |
| `client/src/pages/Inventory.tsx` | Fix 2 — Always-visible TCGplayer button + debug log |
| `client/src/pages/Inventory.tsx` | Fix 3 — Remove `label_created` suppression in `LabelStatusBadge` |
| `client/src/pages/Uploads.tsx` | Fix 4 — Search placeholder + result count badge |

---

## What NOT to Change
- No changes to any API calls, mutations, or query keys in any file
- Do not reorder or remove any toolbar, filter bar, or header elements beyond what is described
- Do not modify `PriceHistory`, `InlineEditPanel`, `BulkActionBar`, `ViewModeToggle`, `InventoryGridCard`, or the upload/SSE flow
- TypeScript only — no new `any` on added code
