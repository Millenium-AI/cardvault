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
import { standardizeCondition } from '../shared/lib/conditionStandardizer';

const SALES_URL = (productId: string) =>
  `https://mpapi.tcgplayer.com/v2/product/${productId}/latestsales`;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CONCURRENCY = 4;
const INTER_BATCH_MS = 100;
const FETCH_LIMIT = 100; // Increased from 25 to capture more sales data for condition-only matching
const ABORT_ERROR_RATE = 0.25;
const MIN_PRODUCTS_BEFORE_ABORT = 12;
const BREAKER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 180;
const SALES_FRESHNESS_MS = 6 * 60 * 60 * 1000; // 6 hours

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

/**
 * Windowed average with fixed outlier removal: average the 5 most recent sales
 * after removing the 2 most extreme values. If less than 5 sales total, use the
 * 3 most recent instead.
 */
export interface WindowedAverageResult {
  avgPrice: number;
  priceCount: number;
  calculationMethod: string;
  excludedSales: Sale[];
}

export function computeWindowedAverage(sales: Sale[]): WindowedAverageResult {
  if (sales.length === 0) {
    return {
      avgPrice: 0,
      priceCount: 0,
      calculationMethod: 'No sales data',
      excludedSales: [],
    };
  }

  // Sort by most recent first
  const sorted = [...sales].sort((a, b) =>
    new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
  );

  // Determine window size: 7 if 5+ sales, otherwise 3
  const windowSize = sorted.length >= 5 ? 7 : 3;
  const inWindow = sorted.slice(0, Math.min(windowSize, sorted.length));
  const prices = inWindow.map(s => s.purchasePrice);

  if (prices.length < 3) {
    // Not enough sales even for the fallback window
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return {
      avgPrice: Number(avg.toFixed(2)),
      priceCount: prices.length,
      calculationMethod: `Average of ${prices.length} ${prices.length === 1 ? 'sale' : 'sales'}`,
      excludedSales: [],
    };
  }

  // Find 2 most extreme values by distance from median
  const med = median(prices);
  const deviations = prices.map((p, i) => ({
    price: p,
    index: i,
    deviation: Math.abs(p - med),
  }));

  // Sort by deviation (largest first), take indices of 2 most extreme
  deviations.sort((a, b) => b.deviation - a.deviation);
  const outliersToRemove = new Set(deviations.slice(0, Math.min(2, prices.length - 1)).map(d => d.index));
  const excludedSales = inWindow.filter((_, i) => outliersToRemove.has(i));

  // Average the remaining
  const remaining = prices.filter((_, i) => !outliersToRemove.has(i));
  const avgPrice = remaining.length > 0
    ? remaining.reduce((a, b) => a + b, 0) / remaining.length
    : 0;

  return {
    avgPrice: Number(avgPrice.toFixed(2)),
    priceCount: remaining.length,
    calculationMethod: `Average of ${remaining.length} ${remaining.length === 1 ? 'sale' : 'sales'} from most recent ${windowSize} (2 outliers excluded)`,
    excludedSales,
  };
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
  calculationMethod: string;
}

function norm(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().trim();
}

export function matchSalesToItem(
  sales: Sale[],
  condition: string | null,
  printing: string | null,
): { matched: Sale[]; match: 'exact' | 'condition_only' | 'none' } {
  const itemCondition = standardizeCondition(condition);
  const sameCondition = sales.filter(s => standardizeCondition(s.condition) === itemCondition);
  const exact = printing
    ? sameCondition.filter(s => norm(s.variant) === norm(printing))
    : sameCondition;

  let matched = exact;
  let match: 'exact' | 'condition_only' | 'none' = 'exact';

  if (!matched.length) {
    matched = sameCondition;
    match = 'condition_only';
  }
  if (!matched.length) {
    return { matched: [], match: 'none' };
  }

  return { matched, match };
}

/**
 * Pick the sales that describe THIS item. Averaging every condition together
 * drags a Near Mint price down with played copies, so exact condition+printing
 * wins, condition-only is the fallback, and anything else scores as no match.
 */
export function computeItemPricing(item: SweepItem, sales: Sale[], windowDays: number): ItemPricing {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let inWindow = sales.filter(s => new Date(s.orderDate).getTime() >= cutoff);

  // Fallback: if no recent sales (illiquid cards), use ALL sales data
  if (inWindow.length === 0 && sales.length > 0) {
    inWindow = sales;
  }

  const { matched, match } = matchSalesToItem(inWindow, item.condition, item.printing);

  if (!matched.length) {
    return {
      adjustedMarketPrice: null, lastSaleDate: null, lastSaleCount: 0,
      lastSaleOutliers: 0, lastSaleMatch: 'none', priceDivergencePct: null, outlierPrices: [],
      calculationMethod: 'No matching sales',
    };
  }

  // Use windowed average: most recent 7 with 2 outliers removed (or 3 if < 5 total)
  const { avgPrice, priceCount, calculationMethod } = computeWindowedAverage(matched);
  const adjusted = avgPrice;

  // Also compute traditional outliers for display purposes
  const prices = matched.map(s => s.purchasePrice);
  const { dropped } = rejectOutliers(prices);

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
    lastSaleOutliers: Math.min(2, dropped.length),
    lastSaleMatch: match,
    priceDivergencePct: divergence == null ? null : Number(divergence.toFixed(2)),
    outlierPrices: dropped,
    calculationMethod,
  };
}

/* ─────────────────────── persistence ─────────────────────── */

async function checkFreshSalesExist(productId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - SALES_FRESHNESS_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('product_sales')
    .select('id')
    .eq('source_product_id', productId)
    .gte('fetched_at', cutoff)
    .limit(1);

  return !error && !!data?.length;
}

async function getAllProductSales(productId: string): Promise<Sale[]> {
  const { data, error } = await supabaseAdmin
    .from('product_sales')
    .select('condition, variant, language, quantity, purchase_price, order_date')
    .eq('source_product_id', productId)
    .order('order_date', { ascending: false })
    .limit(200);

  if (error || !data?.length) return [];
  return data.map(row => ({
    condition: row.condition || null,
    variant: row.variant || null,
    language: row.language || null,
    quantity: row.quantity,
    purchasePrice: row.purchase_price,
    orderDate: row.order_date,
  }));
}

async function storeSales(productId: string, sales: Sale[], outlierMap: Map<string, { price: number; condition: string; variant: string }>) {
  if (!sales.length) return;

  const rows = sales.map(s => {
    const key = `${s.purchasePrice}|${standardizeCondition(s.condition)}|${norm(s.variant)}`;
    const isOutlier = outlierMap.has(key);
    return {
      source_product_id: productId,
      condition: s.condition ?? '',
      variant: s.variant ?? '',
      language: s.language,
      quantity: s.quantity,
      purchase_price: s.purchasePrice,
      order_date: s.orderDate,
      is_outlier: isOutlier,
      fetched_at: new Date().toISOString(),
    };
  });

  // Insert; duplicates on the dedupe index are ignored. The index uses COALESCE
  // so we normalize empty strings above to match.
  const { error } = await supabaseAdmin
    .from('product_sales')
    .insert(rows);

  if (error) {
    if (error.message?.includes('duplicate key')) {
      // Expected on re-sweep; silently ignore
    } else {
      console.warn(`[TCGsales] could not store sales for ${productId}: ${error.message}`);
    }
  }
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
/**
 * Auto-fill missing variant/printing metadata from TCGplayer sales data.
 * If item.matchMetadata.sourcePrinting is not set but sales contain variant info,
 * extract the most common variant and update the item's metadata.
 * This prevents future matching failures when CSV uploads don't include variant info.
 * Returns updated metadata object to update item in memory.
 */
async function ensureSourcePrintingMetadata(
  userId: string,
  item: SweepItem,
  sales: Sale[],
): Promise<Record<string, any> | null> {
  try {
    // Fetch full item to get metadata
    const { data: fullItem, error: fetchErr } = await supabaseAdmin
      .from('inventory_items')
      .select('match_metadata_json')
      .eq('id', item.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr || !fullItem) {
      console.log(`[TCGsales] metadata fetch failed for ${item.id}: ${fetchErr?.message}`);
      return null;
    }

    // Parse existing metadata
    let meta: Record<string, any> = {};
    if (fullItem.match_metadata_json) {
      if (typeof fullItem.match_metadata_json === 'object') {
        meta = fullItem.match_metadata_json;
      } else {
        meta = JSON.parse(fullItem.match_metadata_json);
      }
    }

    // If sourcePrinting already set, no action needed
    if (meta.sourcePrinting) {
      console.log(`[TCGsales] item ${item.id} already has sourcePrinting="${meta.sourcePrinting}"`);
      return null;
    }

    // Extract non-null variants from sales
    const variants = sales
      .map(s => s.variant)
      .filter((v): v is string => v != null && v.length > 0);

    console.log(`[TCGsales] item ${item.id}: found ${sales.length} sales, ${variants.length} with variants: ${JSON.stringify(variants)}`);

    if (!variants.length) {
      console.log(`[TCGsales] item ${item.id}: no variants in sales data`);
      return null;
    }

    // Use most common variant (or first if tied)
    const variantCounts = new Map<string, number>();
    for (const v of variants) {
      variantCounts.set(v, (variantCounts.get(v) ?? 0) + 1);
    }
    const mostCommonVariant = Array.from(variantCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];

    // Update metadata with extracted variant
    meta.sourcePrinting = mostCommonVariant;

    const { error: updateErr } = await supabaseAdmin
      .from('inventory_items')
      .update({ match_metadata_json: meta })
      .eq('id', item.id)
      .eq('user_id', userId);

    if (updateErr) {
      console.error(`[TCGsales] failed to update metadata for ${item.id}: ${updateErr.message}`);
      return null;
    }

    console.log(
      `[TCGsales] ✓ auto-filled sourcePrinting="${mostCommonVariant}" for item ${item.id}`,
    );
    return meta;
  } catch (e: any) {
    console.error(`[TCGsales] metadata exception for item ${item.id}: ${e.message}`);
    return null;
  }
}

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
        const hasFreshData = await checkFreshSalesExist(productId);
        if (hasFreshData) {
          sales = await getAllProductSales(productId);
        } else {
          sales = await fetchLatestSales(productId);
        }
      } catch (e: any) {
        summary.errors++;
        return;
      }

      if (sales.length) summary.productsWithSales++;

      const allOutliers = new Map<string, { price: number; condition: string; variant: string }>();
      const updates: { item: SweepItem; pricing: ItemPricing }[] = [];

      for (const item of byProduct.get(productId)!) {
        // Auto-fill missing variant/printing metadata from TCGplayer sales data
        if (sales.length > 0) {
          const updatedMeta = await ensureSourcePrintingMetadata(userId, item, sales);
          // Update item object with the newly filled metadata
          if (updatedMeta && !item.printing) {
            item.printing = updatedMeta.sourcePrinting ?? null;
          }
        }

        const pricing = computeItemPricing(item, sales, windowDays);
        // Track outliers by (price, condition, variant) so flags don't cross condition boundaries
        pricing.outlierPrices.forEach(price => {
          // Find the matching sale(s) in this condition group to extract their condition+variant
          const matchedSale = sales.find(s => s.purchasePrice === price && standardizeCondition(s.condition) === standardizeCondition(item.condition));
          if (matchedSale) {
            const key = `${price}|${standardizeCondition(item.condition)}|${norm(matchedSale.variant)}`;
            allOutliers.set(key, { price, condition: matchedSale.condition ?? '', variant: matchedSale.variant ?? '' });
          }
        });
        updates.push({ item, pricing });
      }

      await storeSales(productId, sales, allOutliers);

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

  await purgeOldSales();

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

async function purgeOldSales() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from('product_sales')
    .delete()
    .lt('order_date', cutoff);
  if (error) console.warn(`[TCGsales] purge failed: ${error.message}`);
}

/**
 * Ensure fresh sales data exists for a product: if nothing was fetched in the
 * last 6 hours, fetch live from TCGplayer and store it to the shared product_sales
 * table. Fails soft — if the fetch errors or circuit breaker is open, leaves existing
 * data as-is. Safe to call from any route.
 */
export async function ensureLiveSalesFetched(productId: string): Promise<void> {
  if (await checkFreshSalesExist(productId)) return;

  let sales: Sale[];
  try {
    sales = await fetchLatestSales(productId);
  } catch {
    return;
  }
  if (!sales.length) return;

  // Group by (condition, variant) and reject outliers per group, same as the
  // sweep loop's per-item grouping, but without an owning item context.
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    const key = `${standardizeCondition(s.condition)}|${norm(s.variant)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  const outlierMap = new Map<string, { price: number; condition: string; variant: string }>();
  for (const group of groups.values()) {
    const { dropped } = rejectOutliers(group.map(s => s.purchasePrice));
    for (const s of group) {
      if (dropped.includes(s.purchasePrice)) {
        const key = `${s.purchasePrice}|${standardizeCondition(s.condition)}|${norm(s.variant)}`;
        outlierMap.set(key, { price: s.purchasePrice, condition: s.condition ?? '', variant: s.variant ?? '' });
      }
    }
  }

  await storeSales(productId, sales, outlierMap);
}
