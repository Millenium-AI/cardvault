// Pure allocation & valuation helpers for the Transactions feature.
// No DB / network access — safe to unit test in isolation.

export interface AllocationInput {
  /** Per-unit market price used as the allocation weight. */
  marketPrice?: number | null;
  /** Number of units of this line. */
  qty?: number | null;
}

/** Round to whole cents, guarding against binary-float drift (e.g. 3.345 → 3.35). */
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function weightOf(item: AllocationInput): number {
  const price = Number(item.marketPrice);
  const qty = Number(item.qty);
  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  return safePrice * safeQty;
}

/**
 * Split `totalPrice` across `items` proportionally to `marketPrice * qty`.
 *
 * Returns one allocated price per item, each rounded to cents, whose sum is
 * exactly `roundCents(totalPrice)`. The rounding residual is assigned to the
 * largest-weight item (ties broken toward the last item).
 *
 * Edge cases:
 *  - empty list → []
 *  - single item → the full total
 *  - all weights zero/missing → equal split across rows
 */
export function allocatePrices(items: AllocationInput[], totalPrice: number): number[] {
  const n = items.length;
  if (n === 0) return [];

  const total = roundCents(Number.isFinite(totalPrice) ? totalPrice : 0);
  if (n === 1) return [total];

  const weights = items.map(weightOf);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  // Zero-value denominator → fall back to an equal per-row split.
  const effWeights = sumWeights > 0 ? weights : new Array(n).fill(1);
  const effSum = sumWeights > 0 ? sumWeights : n;

  const allocated = effWeights.map(w => roundCents((total * w) / effSum));
  const residual = roundCents(total - allocated.reduce((a, b) => a + b, 0));

  // Largest weight wins the residual; `>=` biases ties toward the last item.
  let target = 0;
  for (let i = 1; i < n; i++) {
    if (effWeights[i] >= effWeights[target]) target = i;
  }
  allocated[target] = roundCents(allocated[target] + residual);

  return allocated;
}

/**
 * Trade-in credit for a single incoming row: `cachedMarketPrice * tradePercent`,
 * rounded to cents. Missing/invalid inputs value the row at 0.
 */
export function tradeCreditValue(
  cachedMarketPrice: number | null | undefined,
  tradePercent: number | null | undefined,
): number {
  const price = Number(cachedMarketPrice);
  const percent = Number(tradePercent);
  if (!Number.isFinite(price) || !Number.isFinite(percent)) return 0;
  return roundCents(price * percent);
}
