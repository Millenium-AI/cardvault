// ─── TCGplayer recent sales → adjusted pricing ────────────────────────────────
// JustTCG's market price lags on illiquid cards. This module cross-checks it
// against what copies actually sold for on TCGplayer, and (when enabled) uses
// the sales average as the effective price that drives print prices and labels.
//
// Source: the endpoint that powers the "Latest Sales" panel on a product page.
// It is undocumented and not a sanctioned API, so every path here degrades to
// "no data, no adjustment" rather than failing the caller, and a circuit
// breaker halts the sweep entirely if TCGplayer starts pushing back.
//
// Shipping is deliberately never parsed or stored.

import { supabaseAdmin } from './supabase';
import { storage } from './storage';

const SALES_URL = (productId: string) =>
  `https://mpapi.tcgplayer.com/v2/product/${productId}/latestsales`;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CONCURRENCY = 4;
const INTER_BATCH_MS = 100;
const FETCH_LIMIT = 25;
const ABORT_ERROR_RATE = 0.25;
const MIN_PRODUCTS_BEFORE_ABORT = 12;
const BREAKER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 180;

export interface Sale {
  condition: string | null;
  variant: string | null;
  language: string | null;
  quantity: number;
  purchasePrice: number;
  orderDate: string;
}

/* ─────────────────────── circuit breaker ─────────────────────── */

let breakerOpenUntil = 0;
let consecutiveBlocks = 0;

export function salesBreakerStatus() {
  return {
    open: Date.now() < breakerOpenUntil,
    opensUntil: breakerOpenUntil ? new Date(breakerOpenUntil).toISOString() : null,
    consecutiveBlocks,
  };
}

function tripBreaker(reason: string) {
  breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
  console.error(
    `[TCGsales] circuit breaker OPEN for 24h — ${reason}. No further sales lookups until ` +
    new Date(breakerOpenUntil).toISOString(),
  );
}

/* ─────────────────────── fetching ─────────────────────── */

export async function fetchLatestSales(productId: string, limit = FETCH_LIMIT): Promise<Sale[]> {
  if (Date.now() < breakerOpenUntil) return [];

  const res = await fetch(SALES_URL(productId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Origin: 'https://www.tcgplayer.com',
      Referer: `https://www.tcgplayer.com/product/${productId}`,
    },
    // NOTE: the `conditions` filter expects condition IDs, not names — passing
    // ["Near Mint"] silently returns zero rows. Always request everything and
    // filter in code.
    body: JSON.stringify({ conditions: [], listingType: 'All', offset: 0, limit }),
  });

  if (res.status === 403 || res.status === 429) {
    consecutiveBlocks++;
    if (consecutiveBlocks >= 3) tripBreaker(`HTTP ${res.status} x${consecutiveBlocks}`);
    throw Object.assign(new Error(`TCGplayer sales ${res.status}`), { status: res.status });
  }

  if (!res.ok) {
    throw Object.assign(new Error(`TCGplayer sales ${res.status}`), { status: res.status });
  }

  consecutiveBlocks = 0;
  const json = await res.json();

  return (json?.data ?? [])
    .map((s: any) => ({
      condition: s.condition ?? null,
      variant: s.variant ?? null,
      language: s.language ?? null,
      quantity: Number(s.quantity ?? 1),
      purchasePrice: Number(s.purchasePrice),
      orderDate: s.orderDate,
      // s.shippingPrice intentionally dropped.
    }))
    .filter((s: Sale) => Number.isFinite(s.purchasePrice) && s.purchasePrice > 0 && s.orderDate);
}

/* ─────────────────────── statistics ─────────────────────── */

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Iglewicz-Hoaglin modified z-score outlier rejection.
 *
 * Uses median + MAD rather than mean + standard deviation: with 3-5 sales a
 * single bad datapoint corrupts the mean AND inflates the standard deviation,
 * so a stddev-based filter fails to catch the very outlier it is looking for.
 */
export function rejectOutliers(values: number[]): { kept: number[]; dropped: number[] } {
  if (values.length < 4) return { kept: values, dropped: [] };

  const med = median(values);
  const mad = median(values.map(v => Math.abs(v - med)));
  if (mad === 0) return { kept: values, dropped: [] };

  const kept: number[] = [];
  const dropped: number[] = [];
  for (const v of values) {
    const z = (0.6745 * (v - med)) / mad;
    (Math.abs(z) > 3.5 ? dropped : kept).push(v);
  }

  // A wide spread is information, not error — never discard most of the sample.
  if (kept.length < Math.ceil(values.length * 0.6)) return { kept: values, dropped: [] };
  return { kept, dropped };
}

/* ─────────────────────── thresholds ─────────────────────── */

export interface DivergenceBand {
  /** Inclusive lower bound of the price band. */
  min: number;
  label: string;
  /** Trigger when sales come in ABOVE market (profit being left on the table). */
  underPct: number | null;
  /** Trigger when sales come in BELOW market. */
  overPct: number | null;
  /** Absolute dollar move required before a percentage means anything. */
  minDelta: number | null;
}

/**
 * Asymmetric by direction: underpricing is realised profit loss the moment a
 * card sells, while overpricing only costs sell-through speed and self-corrects.
 * The dollar floor is what stops sub-dollar cards generating constant noise —
 * measured on live inventory, a flat 15% rule spent 7 of 15 warnings on cards
 * worth under $1.
 */
export const DEFAULT_DIVERGENCE_BANDS: DivergenceBand[] = [
  { min: 100, label: '>$100',   underPct: 4,  overPct: 6,  minDelta: 4.0 },
  { min: 50,  label: '$50-100', underPct: 5,  overPct: 8,  minDelta: 2.5 },
  { min: 20,  label: '$20-50',  underPct: 7,  overPct: 10, minDelta: 1.5 },
  { min: 5,   label: '$5-20',   underPct: 10, overPct: 15, minDelta: 1.0 },
  { min: 1,   label: '$1-5',    underPct: 20, overPct: 25, minDelta: 0.5 },
  // Print price is ceil(), so a sub-dollar card prints $1 regardless. There is
  // no action to take, so it never colours — the badge still shows the %.
  { min: 0,   label: '<$1',     underPct: null, overPct: null, minDelta: null },
];

export function bandFor(price: number, bands = DEFAULT_DIVERGENCE_BANDS): DivergenceBand {
  return bands.find(b => price >= b.min) ?? bands[bands.length - 1];
}

export interface DivergenceVerdict {
  flagged: boolean;
  direction: 'under' | 'over' | 'none';
  band: string;
  threshold: number | null;
}

/** `divergencePct` is signed: positive means sales landed above your market price. */
export function evaluateDivergence(
  marketPrice: number,
  divergencePct: number | null,
  deltaDollars: number,
  bands = DEFAULT_DIVERGENCE_BANDS,
): DivergenceVerdict {
  const band = bandFor(marketPrice, bands);
  if (divergencePct == null) return { flagged: false, direction: 'none', band: band.label, threshold: null };

  const direction = divergencePct > 0 ? 'under' : 'over';
  const threshold = direction === 'under' ? band.underPct : band.overPct;

  if (threshold == null || band.minDelta == null) {
    return { flagged: false, direction, band: band.label, threshold: null };
  }

  const flagged = Math.abs(divergencePct) >= threshold && Math.abs(deltaDollars) >= band.minDelta;
  return { flagged, direction, band: band.label, threshold };
}

export async function getDivergenceBands(userId: string): Promise<DivergenceBand[]> {
  const raw = await storage.getSetting(userId, 'sales_divergence_thresholds');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as DivergenceBand[];
    } catch { /* fall through to defaults */ }
  }
  return DEFAULT_DIVERGENCE_BANDS;
}

/* ─────────────────────── matching + pricing ─────────────────────── */

export interface SweepItem {
  id: string;
  sourceProductId: string | null;
  condition: string | null;
  printing: string | null;
  currentRawMarketPrice: number | null;
  currentRoundedPrintPrice: number | null;
  currentQuantity: number;
  labelStatus: string | null;
  priceLocked: boolean;
}

export interface ItemPricing {
  adjustedMarketPrice: number | null;
  lastSaleDate: string | null;
  lastSaleCount: number;
  lastSaleOutliers: number;
  lastSaleMatch: 'exact' | 'condition_only' | 'none';
  priceDivergencePct: number | null;
  outlierPrices: number[];
}

function norm(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().trim();
}

/**
 * Pick the sales that describe THIS item. Averaging every condition together
 * drags a Near Mint price down with played copies, so exact condition+printing
 * wins, condition-only is the fallback, and anything else scores as no match.
 */
export function computeItemPricing(item: SweepItem, sales: Sale[], windowDays: number): ItemPricing {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = sales.filter(s => new Date(s.orderDate).getTime() >= cutoff);

  const sameCondition = inWindow.filter(s => norm(s.condition) === norm(item.condition));
  const exact = item.printing
    ? sameCondition.filter(s => norm(s.variant) === norm(item.printing))
    : sameCondition;

  let matched = exact;
  let match: ItemPricing['lastSaleMatch'] = 'exact';

  if (!matched.length) {
    matched = sameCondition;
    match = 'condition_only';
  }
  if (!matched.length) {
    return {
      adjustedMarketPrice: null, lastSaleDate: null, lastSaleCount: 0,
      lastSaleOutliers: 0, lastSaleMatch: 'none', priceDivergencePct: null, outlierPrices: [],
    };
  }

  const prices = matched.map(s => s.purchasePrice);
  const { kept, dropped } = rejectOutliers(prices);
  const adjusted = kept.reduce((a, b) => a + b, 0) / kept.length;

  const market = item.currentRawMarketPrice ?? null;
  const divergence = market && market > 0 ? ((adjusted - market) / market) * 100 : null;

  const lastSaleDate = matched
    .map(s => s.orderDate)
    .sort()
    .reverse()[0] ?? null;

  return {
    adjustedMarketPrice: Number(adjusted.toFixed(2)),
    lastSaleDate,
    lastSaleCount: matched.length,
    lastSaleOutliers: dropped.length,
    lastSaleMatch: match,
    priceDivergencePct: divergence == null ? null : Number(divergence.toFixed(2)),
    outlierPrices: dropped,
  };
}

/* ─────────────────────── persistence ─────────────────────── */

async function storeSales(userId: string, productId: string, sales: Sale[], outlierPrices: Set<number>) {
  if (!sales.length) return;
  const rows = sales.map(s => ({
    user_id: userId,
    source_product_id: productId,
    condition: s.condition,
    variant: s.variant,
    language: s.language,
    quantity: s.quantity,
    purchase_price: s.purchasePrice,
    order_date: s.orderDate,
    is_outlier: outlierPrices.has(s.purchasePrice),
    fetched_at: new Date().toISOString(),
  }));

  // The endpoint returns an overlapping window every call, so upsert on the
  // dedupe index keeps repeated sweeps idempotent.
  const { error } = await supabaseAdmin
    .from('product_sales')
    .upsert(rows, { onConflict: 'user_id,source_product_id,order_date,purchase_price,condition,variant', ignoreDuplicates: true });

  if (error) console.warn(`[TCGsales] could not store sales for ${productId}: ${error.message}`);
}

export interface SweepSummary {
  productsChecked: number;
  productsWithSales: number;
  itemsUpdated: number;
  pricesAdjusted: number;
  flagged: number;
  relabelQueued: number;
  errors: number;
  skipped: string | null;
}

/**
 * Fetch sales for every product behind these items, store them, recompute the
 * adjusted price, and apply the label rules.
 *
 * Adjustment requires at least 2 matching sales — one datapoint is shown as a
 * badge but never moves a price.
 */
export async function sweepSalesForItems(
  userId: string,
  items: SweepItem[],
  opts: { windowDays?: number; autoAdjust?: boolean; bands?: DivergenceBand[] } = {},
): Promise<SweepSummary> {
  const summary: SweepSummary = {
    productsChecked: 0, productsWithSales: 0, itemsUpdated: 0,
    pricesAdjusted: 0, flagged: 0, relabelQueued: 0, errors: 0, skipped: null,
  };

  if (Date.now() < breakerOpenUntil) {
    summary.skipped = 'circuit breaker open';
    return summary;
  }

  const priceable = items.filter(i => i.sourceProductId);
  if (!priceable.length) return summary;

  const windowDays = opts.windowDays ?? 30;
  const autoAdjust = opts.autoAdjust ?? true;
  const bands = opts.bands ?? DEFAULT_DIVERGENCE_BANDS;

  // Sales are keyed by product, and several SKUs can share one product.
  const byProduct = new Map<string, SweepItem[]>();
  for (const item of priceable) {
    const list = byProduct.get(item.sourceProductId!) ?? [];
    list.push(item);
    byProduct.set(item.sourceProductId!, list);
  }

  const productIds = Array.from(byProduct.keys());
  const now = new Date().toISOString();

  for (let i = 0; i < productIds.length; i += CONCURRENCY) {
    if (Date.now() < breakerOpenUntil) { summary.skipped = 'circuit breaker tripped mid-sweep'; break; }

    const chunk = productIds.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async productId => {
      summary.productsChecked++;
      let sales: Sale[] = [];

      try {
        sales = await fetchLatestSales(productId);
      } catch (e: any) {
        summary.errors++;
        return;
      }

      if (sales.length) summary.productsWithSales++;

      const allOutliers = new Set<number>();
      const updates: { item: SweepItem; pricing: ItemPricing }[] = [];

      for (const item of byProduct.get(productId)!) {
        const pricing = computeItemPricing(item, sales, windowDays);
        pricing.outlierPrices.forEach(p => allOutliers.add(p));
        updates.push({ item, pricing });
      }

      await storeSales(userId, productId, sales, allOutliers);

      for (const { item, pricing } of updates) {
        try {
          await applyPricing(userId, item, pricing, { autoAdjust, bands, now, summary });
        } catch (e: any) {
          console.error(`[TCGsales] failed to apply pricing for item ${item.id}: ${e.message}`);
          summary.errors++;
        }
      }
    }));

    // Abort rather than hammer a service that is clearly rejecting us.
    if (
      summary.productsChecked >= MIN_PRODUCTS_BEFORE_ABORT &&
      summary.errors / summary.productsChecked > ABORT_ERROR_RATE
    ) {
      summary.skipped = `aborted after ${summary.errors} errors in ${summary.productsChecked} products`;
      console.error(`[TCGsales] ${summary.skipped}`);
      break;
    }

    if (i + CONCURRENCY < productIds.length) {
      await new Promise(r => setTimeout(r, INTER_BATCH_MS));
    }
  }

  await purgeOldSales(userId);

  console.log(
    `[TCGsales] swept ${summary.productsChecked} products (${summary.productsWithSales} with sales) — ` +
    `${summary.itemsUpdated} items updated, ${summary.pricesAdjusted} prices adjusted, ` +
    `${summary.flagged} flagged, ${summary.relabelQueued} queued for relabel, ${summary.errors} errors`,
  );

  return summary;
}

async function applyPricing(
  userId: string,
  item: SweepItem,
  pricing: ItemPricing,
  ctx: { autoAdjust: boolean; bands: DivergenceBand[]; now: string; summary: SweepSummary },
) {
  const patch: Record<string, any> = {
    last_sale_date: pricing.lastSaleDate,
    last_sale_count: pricing.lastSaleCount,
    last_sale_outliers: pricing.lastSaleOutliers,
    last_sale_match: pricing.lastSaleMatch,
    last_sale_fetched_at: ctx.now,
    price_divergence_pct: pricing.priceDivergencePct,
    adjusted_market_price: pricing.adjustedMarketPrice,
    updated_at: ctx.now,
  };

  const market = item.currentRawMarketPrice ?? 0;
  const delta = pricing.adjustedMarketPrice != null ? pricing.adjustedMarketPrice - market : 0;
  const verdict = evaluateDivergence(market, pricing.priceDivergencePct, delta, ctx.bands);
  if (verdict.flagged) ctx.summary.flagged++;

  // A single sale is evidence of a badge, not grounds to reprice.
  const enoughEvidence = pricing.lastSaleCount >= 2 && pricing.adjustedMarketPrice != null;
  const shouldAdjust = ctx.autoAdjust && enoughEvidence && !item.priceLocked;

  let queueRelabel = false;

  if (shouldAdjust) {
    const newPrint = Math.ceil(pricing.adjustedMarketPrice!);
    const oldPrint = item.currentRoundedPrintPrice ?? null;

    if (newPrint !== oldPrint) {
      patch.current_rounded_print_price = newPrint;
      // Print price is ceil(), so only a change in the printed dollar is worth
      // a reprint — $8.10 -> $8.60 prints $9 either way.
      if (item.labelStatus === 'label_created') {
        patch.label_status = 'needs_repricing';
        queueRelabel = true;
      }
    }
    ctx.summary.pricesAdjusted++;
  }

  const { error } = await supabaseAdmin
    .from('inventory_items')
    .update(patch)
    .eq('id', item.id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  ctx.summary.itemsUpdated++;

  if (queueRelabel) {
    const { error: qErr } = await supabaseAdmin.from('label_queue_items').insert({
      user_id: userId,
      inventory_item_id: item.id,
      queue_type: 'reprice',
      prior_raw_price: item.currentRawMarketPrice,
      current_raw_price: pricing.adjustedMarketPrice,
      rounded_print_price: Math.ceil(pricing.adjustedMarketPrice!),
      percent_change: pricing.priceDivergencePct,
      threshold_rule: `sales-adjusted (${verdict.band})`,
      is_selected_for_export: true,
      export_status: 'pending',
      created_at: ctx.now,
    });
    if (qErr) console.warn(`[TCGsales] could not queue relabel for ${item.id}: ${qErr.message}`);
    else ctx.summary.relabelQueued++;
  }

  // Keep price history continuous when the effective price actually moves.
  if (shouldAdjust && pricing.adjustedMarketPrice != null) {
    const latest = await storage.getLatestSnapshot(userId, item.id);
    const changed = !latest || Number(latest.rawMarketPrice) !== pricing.adjustedMarketPrice;
    if (changed) {
      await storage.createPriceSnapshot(userId, {
        inventoryItemId: item.id,
        uploadId: null,
        snapshotDate: ctx.now,
        rawMarketPrice: pricing.adjustedMarketPrice,
        roundedPrintPrice: Math.ceil(pricing.adjustedMarketPrice),
        quantityAfterMerge: item.currentQuantity ?? 0,
      });
    }
  }
}

async function purgeOldSales(userId: string) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from('product_sales')
    .delete()
    .eq('user_id', userId)
    .lt('order_date', cutoff);
  if (error) console.warn(`[TCGsales] purge failed: ${error.message}`);
}
