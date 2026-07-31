# Last Sale Cross-Check — Implementation Guide (Phases 2-6)

Handoff document for continuing the TCGplayer last-sale / adjusted-pricing feature.
**Phase 1 is complete and deployed.** Phases 2-6 remain.

Each phase below is written as a self-contained prompt. Run them **in order**, one at a
time, verifying before moving on. Do not attempt all phases in one pass.

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
