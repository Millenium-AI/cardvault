# CardVault Redesign — Implementation Game Plan

## Context
CardVault is a TCG inventory management app for card show vendors. This plan consolidates the New Labels and Repricing tabs into a unified Inventory page with an always-on Niimbot label export button, and wires up JustTCG price refresh on every upload approval.

---

## Current Stack
- **Frontend:** React + TypeScript, Wouter routing, TanStack Query, shadcn/ui
- **Backend:** Express + TypeScript (`server/routes.ts`)
- **Database:** Supabase (Postgres), RLS enabled on all tables
- **Price API:** JustTCG (`server/justtcg.ts`) — fully built with batch fetch + Supabase cache
- **Label export:** Niimbot-compatible XLSX/CSV, single and dual (A/B) sticker modes

---

## Completed
- [x] RLS enabled on `public.price_cache` — authenticated users can read, service role writes

---

## Nav Change

| Before | After |
|--------|--------|
| Dashboard | Dashboard |
| Uploads | Uploads |
| Inventory | **Inventory** (absorbs Labels + Repricing) |
| New Labels | removed |
| Repricing | removed |
| Shows | Shows |
| Settings | Settings |

---

## Badge System

Every `inventory_item` always has exactly one `label_status` value:

| Value | Meaning | Set When |
|-------|---------|----------|
| `needs_label` | New card, never printed | Upload approved — new item |
| `needs_repricing` | Price moved past threshold | JustTCG refresh crosses threshold |
| `label_created` | Label is current, no action needed | After export runs |

### Transition Rules
1. New card added → `needs_label`
2. Export runs → `label_created`
3. Re-import / JustTCG refresh, price unchanged → stays `label_created`
4. Re-import / JustTCG refresh, price crosses threshold → `needs_repricing`
5. Export runs again → `label_created`

> A card always has one of these three states. There is no null/empty badge state.

---

## Step 1 — Supabase Migration: Add `label_status` to `inventory_items`

```sql
ALTER TABLE public.inventory_items
  ADD COLUMN label_status text NOT NULL DEFAULT 'needs_label'
  CHECK (label_status IN ('needs_label', 'needs_repricing', 'label_created'));

-- Backfill existing cards as label_created (they've been in inventory already)
UPDATE public.inventory_items SET label_status = 'label_created';

CREATE INDEX idx_inventory_items_label_status
  ON public.inventory_items (user_id, label_status);
```

> `label_queue_items` table is kept for audit trail and price change % detail — it is no longer the source of truth for badge display.

---

## Step 2 — Backend: Update `approve_upload` RPC

File: Supabase SQL (update existing `approve_upload` function)

When approving an upload:
- **New items** → insert into `inventory_items` with `label_status = 'needs_label'`
- **Repriced items** → update `inventory_items` set `label_status = 'needs_repricing'`
- **Matched items (no price change)** → do not change `label_status`

---

## Step 3 — Backend: JustTCG Re-import Refresh Trigger

File: `server/routes.ts` — inside `POST /api/uploads/:id/approve` handler

After upload is approved, two background jobs fire via `setImmediate`:

### Job 1 (already exists)
`enrichNewItemsWithLivePrices(userId, newItemIds)`
Fetches JustTCG prices for newly added cards.

### Job 2 (new)
`refreshExistingInventoryPrices(userId, uploadGame)`

Logic:
1. Load all existing inventory items for user (excluding new items just added)
2. Filter to items that have `source_tcgplayer_id` and `price_last_fetched_at` older than 6 hours (or never fetched)
3. Batch fetch prices from JustTCG in chunks of 20 with 6s delay between batches
4. For each result:
   - Update `current_raw_market_price`, `current_rounded_print_price`, `price_last_fetched_at` on `inventory_items`
   - Run `checkRepricingThreshold(newPrice, oldPrice, thresholds)`
   - If threshold crossed AND current `label_status !== 'needs_label'` → set `label_status = 'needs_repricing'`
   - Insert row into `label_queue_items` with `queue_type = 'reprice'` for audit trail

> Do not flip `needs_label` to `needs_repricing` — if a card is already awaiting its first label, that takes priority.

---

## Step 4 — Backend: Update Export Endpoint

File: `server/routes.ts` — `POST /api/labels/export`

### New Request Body
```ts
{
  game: string;           // scope export to this game, or "all"
  format: "xlsx" | "csv";
  stickerMode: "single" | "dual";
}
```

### New Logic
1. Query `inventory_items` where `user_id = userId` AND `label_status IN ('needs_label', 'needs_repricing')` AND `game = game` (if not "all")
2. Build Niimbot rows from those items (same `buildNiimbotCsv` / `buildNiimbotDualCsv` helpers)
3. Return file download
4. After success: `UPDATE inventory_items SET label_status = 'label_created' WHERE id IN (...exportedIds)`
5. Also update corresponding `label_queue_items` rows to `export_status = 'exported'`

> No `ids` array needed in request — export is always "all pending for this game."

---

## Step 5 — Frontend: `Inventory.tsx` Redesign

File: `client/src/pages/Inventory.tsx`

### Layout Changes

**Top of page:**
- Stats bar (unchanged)
- Filter pills with live counts:
  - `All (n)` · `Needs Label (n)` · `Needs Repricing (n)` · `Label Created (n)`
- **Export Labels button** — always visible, always enabled
  - Dropdown: Excel Single · Excel Dual (A/B) · CSV Single · CSV Dual (A/B)
  - Dual options gated to `isAdmin`
  - On click: POST `/api/labels/export` with `{ game, format, stickerMode }`
  - On success: invalidate inventory query, toast confirmation

**Card/row list:**
- Each row shows inline badge: `Needs Label` (blue) · `Needs Repricing` (orange) · `Label Created` (green)
- Filter pills control visible rows — no page navigation
- Expand detail panel unchanged (price history, edit, delete, notes)

### New API Call
```ts
// replaces two separate /api/labels/new and /api/labels/reprice calls
POST /api/labels/export
Body: { game, format, stickerMode }
```

---

## Step 6 — Frontend: `AppShell.tsx` Nav Cleanup

File: `client/src/components/AppShell.tsx`

```ts
// Remove from nav array:
{ href: "/new-labels", label: "New Labels", icon: Tag },
{ href: "/repricing",  label: "Repricing",  icon: RefreshCcw },

// Remove from mobileNavPrimary:
{ href: "/new-labels", label: "Labels",    icon: Tag },
{ href: "/repricing",  label: "Repricing", icon: RefreshCcw },

// isActive helper: no changes needed
```

---

## Step 7 — Frontend: Router + File Cleanup

### Router (likely `client/src/App.tsx`)
```ts
// Remove:
<Route path="/new-labels" component={NewLabels} />
<Route path="/repricing"  component={RepricingQueue} />
```

### Files to Delete
- `client/src/pages/NewLabels.tsx`
- `client/src/pages/RepricingQueue.tsx`

---

## Build Order Summary

| Step | What | File(s) |
|------|------|---------|
| ✅ 0 | RLS on price_cache | Supabase |
| 1 | Add `label_status` column | Supabase migration |
| 2 | Update `approve_upload` RPC | Supabase SQL |
| 3 | JustTCG re-import refresh trigger | `server/routes.ts` |
| 4 | Update export endpoint | `server/routes.ts` |
| 5 | Inventory page redesign | `client/src/pages/Inventory.tsx` |
| 6 | Nav cleanup | `client/src/components/AppShell.tsx` |
| 7 | Router + delete old pages | `client/src/App.tsx`, delete 2 files |

---

## What Does NOT Change
- Upload → parse → review → approve flow
- Price threshold detection logic (`checkRepricingThreshold`)
- `label_queue_items` table structure (kept for audit)
- `justtcg.ts` API client
- `buildNiimbotCsv` / `buildNiimbotDualCsv` helpers
- All other pages (Dashboard, Uploads, Shows, Settings)
- Per-user RLS data isolation
