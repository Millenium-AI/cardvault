# Last Sale Cross-Check — Implementation Guide (Phases 2-6)

Handoff document for continuing the TCGplayer last-sale / adjusted-pricing feature.
**Phase 1 is complete and deployed.** Phases 2-6 remain.

Each phase below is written as a self-contained prompt. Run them **in order**, one at a
time, verifying before moving on. Do not attempt all phases in one pass.

---

## 0. Context you need before starting

### What this feature does

JustTCG's market price lags badly on illiquid cards. Measured against 108 real cards in
this inventory, one card showed a market price of $137.97 while four separate copies
actually sold for ~$216 — a 57% gap, and real money left on the table.

This feature cross-checks JustTCG against what copies actually sold for on TCGplayer,
shows a ±% badge on every card, and (when enabled) uses the sales average as the
**effective price** that drives print prices and labels.

### The data source

```
POST https://mpapi.tcgplayer.com/v2/product/{productId}/latestsales
Content-Type: application/json
{"conditions":[],"listingType":"All","offset":0,"limit":25}
```

Returns:
```json
{"condition":"Near Mint","variant":"Foil","language":"English","quantity":1,
 "purchasePrice":116.64,"shippingPrice":0.0,"orderDate":"2026-07-31T07:48:04.917+00:00"}
```

**Hard-won facts — do not rediscover these:**

| Fact | Consequence |
|---|---|
| The `conditions` filter takes condition **IDs**, not names. `["Near Mint"]` returns zero rows | Always send `[]` and filter in code |
| Responses mix all conditions and printings for a product | Match on condition + printing yourself |
| Thin cards return 3-5 sales even at `limit: 25` | Treat low counts as low confidence |
| Requires browser `User-Agent` + `Origin: https://www.tcgplayer.com` | Set both on every call |
| 108 products fetched in 1.0s at concurrency 4 | A full 432-product sweep is ~4s. No need for aggressive parallelism |
| 93% of sampled products had matching sales in 30 days | The 7% empty case is normal, not an error |
| `productId` == the `source_product_id` already stored on every inventory item | No lookup needed |

**This endpoint is undocumented and TCGplayer's terms prohibit automated collection.**
Every code path must degrade to "no badge, no adjustment" rather than throwing. It is
feature-flagged and server-side only — never call it from the browser.

### Shipping is banned

Per an explicit product decision, `shippingPrice` must **never** be parsed, stored,
displayed, or used in any calculation. It is dropped at parse time in
`server/tcgplayerSales.ts`. Do not reintroduce it anywhere.

---

## 1. What Phase 1 already delivered

**Database (applied to Supabase, recorded in `migrations/20260731_last_sale_cross_check.sql`):**

`inventory_items` gained:

| Column | Type | Meaning |
|---|---|---|
| `adjusted_market_price` | numeric | Mean of outlier-filtered matching sales |
| `last_sale_date` | timestamptz | Most recent matching sale |
| `last_sale_count` | integer | Sales backing the average |
| `last_sale_outliers` | integer | Dropped by the MAD filter |
| `last_sale_match` | text | `exact` \| `condition_only` \| `none` |
| `last_sale_fetched_at` | timestamptz | Sweep freshness |
| `price_divergence_pct` | numeric | Signed `(adjusted − market) / market × 100` |
| `price_locked` | boolean | **Pin** — excludes the item from auto-adjustment |

New `product_sales` table: `id, user_id, source_product_id, condition, variant, language,
quantity, purchase_price, order_date, is_outlier, fetched_at`. RLS self-scoped,
service_role full access, unique dedupe index, no shipping column.

`shared/schema.ts` mirrors all of the above.

**Code written but deliberately NOT wired in — nothing imports it yet:**

`server/tcgplayerSales.ts` already contains, complete and typechecking:

- `fetchLatestSales(productId, limit)` — with the correct headers and empty `conditions`
- `rejectOutliers(values)` — Iglewicz-Hoaglin modified z-score
- `DEFAULT_DIVERGENCE_BANDS`, `bandFor`, `evaluateDivergence`, `getDivergenceBands`
- `computeItemPricing(item, sales, windowDays)` — matching + averaging
- `sweepSalesForItems(userId, items, opts)` — the full sweep with circuit breaker
- `applyPricing` — price update, label rules, snapshot writing
- `salesBreakerStatus()`

`server/storage.ts` gained `listProductSales`, `listItemsForSalesSweep`,
`getSalesCheckSettings`, and the new `InventoryItem` type fields.

**Phase 2 is therefore mostly a review-and-wire job, not a from-scratch build.**

---

## 2. Product rules that must not drift

### Thresholds — banded and asymmetric

| Price band | Underpriced (sales **above** market) | Overpriced (sales **below** market) | Min $ delta |
|---|---|---|---|
| > $100 | 4% | 6% | $4.00 |
| $50-100 | 5% | 8% | $2.50 |
| $20-50 | 7% | 10% | $1.50 |
| $5-20 | 10% | 15% | $1.00 |
| $1-5 | 20% | 25% | $0.50 |
| < $1 | never coloured | never coloured | — |

Underpriced triggers are tighter because underpricing is realised profit loss the moment
a card sells, while overpricing only costs sell-through speed and self-corrects.

These were chosen from measured data, not intuition. On 100 real cards a flat 15% rule
fired 15 times and **spent 7 of those warnings on sub-dollar cards** (one was `$0.33 →
$0.21`, a "−35.8%" alarm over twelve cents) while missing two $50-100 cards. The banded
rule fires 8 times and catches the ones that matter. **Do not replace this with a flat
percentage.**

Sub-$1 never colours because print price is `ceil()` — a sub-dollar card prints $1
regardless of what the sales say, so there is no action to take. The badge still shows
the percentage.

### Outlier rejection

Modified z-score on median + MAD, **not** mean + standard deviation: with 3-5 sales one
bad datapoint corrupts the mean and inflates the standard deviation simultaneously, so a
stddev filter fails to catch the very outlier it is hunting.

- Only filter when `n >= 4`
- If MAD is 0, keep everything
- Never drop more than 40% of points
- **`n >= 2` required to adjust a price.** A single sale shows a badge but never moves a
  price — 10 of 100 sampled cards had exactly one sale, and one of those read +28.5%

### Price resolution order — used everywhere

```
effectivePrice = price_locked
  ? current_raw_market_price
  : (adjusted_market_price ?? current_raw_market_price)
```

This must be identical in the dashboard Market Value KPI, the inventory Total column,
label exports, and the storefront. **Never overwrite `current_raw_market_price` with the
sales average** — the divergence comparison would become self-referential and read 0%
forever, killing the badge.

### Label rules

```
new ceil(effectivePrice) == old current_rounded_print_price?
  ├─ yes → update the number, no label action, ever
  └─ no  → label_status == 'label_created'?
             ├─ yes → update + set 'needs_repricing' + insert reprice row in label_queue_items
             └─ no  → update silently (already queued for a first label)
```

Only a change in the **printed dollar** justifies a reprint. `$8.10 → $8.60` prints $9
both times. All 433 items are currently `needs_label`, so the relabel branch will not
fire until after the first label export.

---

## 3. Repo conventions to follow

- Server routes live in `server/routes/*.ts`, registered from `server/routes/index.ts`
- All DB access goes through `server/storage.ts`; routes do not query Supabase directly
  unless they already do so (`uploads.ts` and `inventory.ts` have precedent)
- **Every list query must paginate.** PostgREST caps SELECTs at 1000 rows. Use the
  existing `fetchAllPages()` helper in `storage.ts`. This bug already caused a production
  incident
- Client data fetching is TanStack Query keyed by the API path, e.g.
  `useQuery({ queryKey: ["/api/inventory"] })`; mutations use `apiRequest(method, url, body)`
  from `@/lib/queryClient`, which throws on non-2xx
- Tailwind with an existing token vocabulary: `text-muted-foreground`, `border-border`,
  `bg-accent`, `text-primary`. Amber = warning (`text-amber-400`, `bg-amber-500/15`),
  red = negative, emerald = positive. Reuse the `warn` prop pattern on the dashboard's
  `StatCard`
- Typecheck with `npx tsc --noEmit`. There are ~5 **pre-existing** errors
  (`LogTransactionForm.tsx`, `UploadForm.tsx:127`, `priceRefresh.ts:47`, `justtcg.ts:309`,
  `uploads.ts:1`) — ignore those, but introduce no new ones
- Build with `npm run build`
- Conventional-ish commit style: `area: summary`, then a body explaining **why**

---

## PHASE 2 — Wire up the sales fetcher

> **Prompt for Claude:**
>
> Read `server/tcgplayerSales.ts` in full. It was written in a prior session, typechecks,
> and is not yet imported anywhere. Your job is to review it and wire it into the app.
>
> 1. **Review** the module against the rules in §2 of `docs/last-sale-implementation-guide.md`.
>    Verify: the `conditions` array is always empty, shipping is never stored, the MAD
>    filter only runs at n>=4, adjustment requires n>=2, and `current_raw_market_price` is
>    never overwritten. Fix anything that deviates. Do not restructure working code.
>
> 2. **Add a manual endpoint** in `server/routes/prices.ts`:
>    `POST /api/prices/check-sales` accepting optional `{ itemIds?: string[], minValue?: number }`.
>    It must:
>    - Read settings via `storage.getSalesCheckSettings(userId)` and return early with
>      `{ skipped: "disabled" }` if `enabled` is false
>    - Load items via `storage.listItemsForSalesSweep(userId, { ids, minValue })`
>    - Load bands via `getDivergenceBands(userId)`
>    - Call `sweepSalesForItems` and return the `SweepSummary` plus `salesBreakerStatus()`
>
> 3. **Add** `GET /api/inventory/:id/sales` in `server/routes/inventory.ts` returning
>    `storage.listProductSales(userId, item.sourceProductId)` — all sales including
>    outliers — plus the item's `lastSaleMatch`, `lastSaleCount`, `lastSaleOutliers`,
>    `adjustedMarketPrice`, and `priceDivergencePct`. Return `{ sales: [] }` when the item
>    has no `sourceProductId`.
>
> 4. **Allow the pin** — add `priceLocked` to the `allowed` array in the existing
>    `PATCH /api/inventory/:id` handler.
>
> **Acceptance:** `npx tsc --noEmit` introduces no new errors; `npm run build` passes;
> hitting `POST /api/prices/check-sales` with `{"minValue": 50}` returns a summary with
> `productsChecked > 0` and writes rows to `product_sales`.
>
> **Do not** touch the UI in this phase. Commit as
> `sales: wire TCGplayer sales sweep into manual endpoint and inventory API`.

---

## PHASE 3 — Automatic sweeps and effective pricing

> **Prompt for Claude:**
>
> Phase 2 exposed the sweep manually. Now run it automatically and make the adjusted price
> the effective price across the app.
>
> 1. **Post-approve hook** — in `server/routes/uploads.ts`, inside the `setImmediate`
>    block of `POST /api/uploads/:id/approve` that already runs the JustTCG refresh and the
>    pending-price sweep, append a sales sweep for the same item ids. It must run *after*
>    prices resolve, because divergence needs a market price to compare against. Respect
>    `getSalesCheckSettings`. Never let a sales failure affect the upload result.
>
> 2. **Daily job** — in `server/jobs/priceRefresh.ts`, after `refreshInventoryPrices`
>    completes for a user, sweep that user's items with
>    `storage.listItemsForSalesSweep(userId, { staleHours: 24 })` so each card is rechecked
>    at most daily.
>
> 3. **Effective price everywhere.** Add a shared helper — put it in
>    `shared/lib/effectivePrice.ts` so client and server agree:
>    ```ts
>    export function effectivePrice(item): number | null   // §2 resolution order
>    export function effectivePrintPrice(item): number | null  // ceil of the above
>    ```
>    Apply it in:
>    - `storage.getDashboardStats` → `totalMarketValue` uses effective price (still paginated)
>    - `server/routes/inventory.ts` GET `/api/inventory` → add computed `effectivePrice` and
>      `divergenceFlagged` (from `evaluateDivergence` with the user's bands) to each item in
>      the response, alongside the existing `tcgplayerUrl`
>    - `server/routes/inventory.ts` export and `csvHelpers.buildLabelCsv` → print price
>      follows the effective price
>
> 4. **Settings** — add `sales_check_enabled`, `sales_auto_adjust_enabled`,
>    `sales_check_window_days`, and `sales_divergence_thresholds` to the settings
>    GET/PUT routes so they are editable.
>
> **Acceptance:** approving an upload results in populated `adjusted_market_price` on items
> that have sales; the dashboard Market Value shifts to reflect adjusted prices; toggling
> `sales_auto_adjust_enabled=false` stops price changes but still records divergence.
>
> Commit as `sales: automatic sweeps and effective-price resolution`.

---

## PHASE 4 — The badge on collapsed cards

> **Prompt for Claude:**
>
> Build `client/src/components/PriceDivergenceBadge.tsx` and place it in the three
> collapsed inventory views. **This is the highest-value phase for the user** — they want
> the warning visible without expanding anything.
>
> **Component API:** `{ item }` where item carries `priceDivergencePct`, `adjustedMarketPrice`,
> `lastSaleCount`, `lastSaleMatch`, `lastSaleFetchedAt`, `divergenceFlagged`, `priceLocked`.
>
> **States:**
>
> | Condition | Rendering |
> |---|---|
> | No `priceDivergencePct` | Render nothing |
> | Within threshold | Neutral grey chip, e.g. `+3%` — visible but quiet |
> | Flagged, positive | **Amber** chip with up arrow — sells above your price |
> | Flagged, negative | **Red** chip with down arrow — sells below your price |
> | `lastSaleMatch === 'condition_only'` | Outline/hollow variant — weaker evidence |
> | `lastSaleFetchedAt` older than 7 days | Dimmed (`opacity-50`) |
> | `priceLocked` | Small pin icon next to the chip |
>
> Tooltip: `Avg of {lastSaleCount} {condition} / {printing} sales · ${adjustedMarketPrice} · most recent {date}`.
>
> **Placement:**
> - `client/src/pages/Inventory/ItemRow.tsx` — inside the existing `market` `<td>`, to the
>   right of the price. Must not break the column layout or wrap
> - `client/src/pages/Inventory/ItemGrid.tsx` — corner of the tile
> - `client/src/pages/Inventory/MobileCard.tsx` — in the stats row beside the market price
>
> The badge must be small enough not to disturb existing density. Check all three at
> narrow widths — text wrapping in a table cell is the most likely defect here.
>
> **Acceptance:** every card with sales data shows a percentage regardless of size;
> only cards past their band threshold get colour; no layout shift or wrapped text in any
> of the three views.
>
> Commit as `inventory: price divergence badge on collapsed views`.

---

## PHASE 5 — Recent sales in the expanded views

> **Prompt for Claude:**
>
> Build `client/src/components/RecentSalesPanel.tsx` once and mount it in **all four**
> expanded surfaces: `ExpandedDetailRow.tsx`, `DetailSheet.tsx`, `DetailPanel.tsx`,
> `MobileDetailDrawer.tsx`.
>
> Data source: `GET /api/inventory/:id/sales` from phase 2, via TanStack Query, fetched
> only when the panel mounts.
>
> **Layout:**
>
> 1. Header: `Recent Sales` + `checked {relative time}` + a manual re-check button that
>    POSTs to `/api/prices/check-sales` with `{ itemIds: [item.id] }` and invalidates
>    both `/api/inventory` and the sales query
> 2. Four tiles, matching the existing Qty/Market/Print tile pattern already in
>    `ExpandedDetailRow.tsx` (`rounded-lg border border-border bg-muted/30`):
>    `JustTCG` · `Sales Avg` · `Difference` (coloured by direction) · `Print Price`
> 3. Sales table — **every** stored sale, newest first. Columns: Date, Price, Cond,
>    Printing, Qty. **No shipping column.** Three row states:
>    - included → normal
>    - `isOutlier` → struck through, amber `outlier` chip
>    - condition or printing doesn't match the item → greyed, muted `other condition` chip
> 4. Footer: `Average of {n} {condition} / {printing} sales · {x} outliers excluded · {y} other conditions`
> 5. **Pin toggle** — a small control bound to `priceLocked` via
>    `PATCH /api/inventory/:id`. When on, show `Price pinned — automatic sales adjustment
>    is off for this card`
> 6. Empty state: `No recent sales on TCGplayer for this product` with a one-line note that
>    this usually means an illiquid card whose market price may be stale
>
> Also update the manual price editor in `DetailPanel.tsx`: when `adjustedMarketPrice` is
> present and the card is not pinned, show `Sales data is driving this price — manual edits
> will be replaced on the next check` beneath the input.
>
> **Acceptance:** the panel renders identically in all four surfaces; outliers are visible
> but clearly excluded; the pin round-trips and survives a sweep.
>
> Commit as `inventory: recent sales panel in expanded views`.

---

## PHASE 6 — Dashboard, filter, settings

> **Prompt for Claude:**
>
> 1. **Dashboard KPI** in `client/src/pages/Dashboard.tsx` — add a `Price Mismatch` card to
>    the existing KPI grid: count of items where `divergenceFlagged` is true, with total
>    dollar impact as the sub-label. Use the existing `warn` prop for amber styling. Clicking
>    it routes to `/inventory` with the mismatch filter active. Keep the grid at 6 columns —
>    if that means displacing a card, displace `Reprice Queue`, which is reachable elsewhere.
>
> 2. **Filter chip** in `client/src/pages/Inventory/index.tsx` — add `Price mismatch` to the
>    existing `labelOptions` chip row (`All Items` / `Needs Label` / `Needs Repricing` /
>    `Label Created`) with a count, filtering client-side on `divergenceFlagged`.
>
> 3. **Settings editor** in `client/src/pages/Settings.tsx` — a `Sales Cross-Check` section
>    with: an enable toggle, an auto-adjust toggle, a window-days input, and an editable
>    table of the six threshold bands (under %, over %, min $). Mirror the presentation of
>    the existing repricing-thresholds editor. Include a `Run check now` button hitting
>    `/api/prices/check-sales` that reports the returned summary in a toast.
>
> 4. Surface `salesBreakerStatus()` in the settings section — if the circuit breaker is
>    open, show a clear amber notice with the time it reopens.
>
> **Acceptance:** the KPI count matches the number of badges visible in the inventory list;
> the filter chip narrows to exactly those items; threshold edits persist and change which
> cards are flagged on the next load.
>
> Commit as `dashboard: price mismatch KPI, inventory filter, sales settings`.

---

## 4. Verification checklist for the whole feature

Run against the live database after phase 6:

```sql
-- Coverage: how many items have sales data
select count(*) total,
       count(*) filter (where adjusted_market_price is not null) with_sales,
       count(*) filter (where last_sale_match = 'exact') exact_match,
       count(*) filter (where last_sale_match = 'condition_only') cond_only,
       count(*) filter (where last_sale_count = 1) single_sale,
       count(*) filter (where price_locked) pinned
from inventory_items where status = 'active';

-- The money question: biggest divergences
select product_name, condition, current_raw_market_price, adjusted_market_price,
       price_divergence_pct, last_sale_count, last_sale_outliers, last_sale_match
from inventory_items
where price_divergence_pct is not null
order by abs(price_divergence_pct) desc limit 20;

-- Sanity: no item should have been adjusted off a single sale
select count(*) from inventory_items
where adjusted_market_price is not null and last_sale_count < 2;   -- must be 0

-- Sanity: market price must never equal the adjusted price by overwrite
select count(*) from inventory_items
where adjusted_market_price is not null
  and current_raw_market_price = adjusted_market_price
  and last_sale_count > 1;   -- should be near 0; exact ties are possible but rare
```

Expected on this inventory: roughly 90%+ coverage, a handful of flagged cards, and
`pid 532116` (Monkey.D.Luffy P-061) showing roughly +57%.

---

## 5. Things that will go wrong

| Symptom | Cause |
|---|---|
| Every card reads 0% divergence | Something overwrote `current_raw_market_price` with the adjusted price. See §2 |
| Sales queries return nothing | The `conditions` filter is being sent with names. Send `[]` |
| Hundreds of sub-dollar warnings | A flat percentage rule slipped back in; the dollar floor is missing |
| Dashboard total wrong past 1000 items | A query lost its `fetchAllPages` pagination |
| Constant relabel churn | Label logic is comparing raw prices instead of `ceil()`ed print prices |
| Sweep silently does nothing | Circuit breaker is open — check `salesBreakerStatus()` |
| Prices flapping between two values | A card is being adjusted off n=1; enforce the n>=2 rule |
