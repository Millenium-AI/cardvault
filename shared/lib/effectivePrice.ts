/**
 * Effective price resolution: the price that drives print prices and labels.
 * §2 resolution order: locked → adjusted → market
 */

export interface PriceableItem {
  priceLocked?: boolean | null;
  adjustedMarketPrice?: number | null;
  currentRawMarketPrice?: number | null;
}

export function effectivePrice(item: PriceableItem): number | null {
  if (item.priceLocked) {
    return item.currentRawMarketPrice ?? null;
  }
  return item.adjustedMarketPrice ?? item.currentRawMarketPrice ?? null;
}

export function effectivePrintPrice(item: PriceableItem): number | null {
  const price = effectivePrice(item);
  return price != null ? Math.ceil(price) : null;
}
