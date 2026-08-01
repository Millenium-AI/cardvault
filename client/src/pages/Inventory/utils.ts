export function parseMatchMetadata(matchMetadataJson: any): Record<string, any> {
  try {
    return typeof matchMetadataJson === "string"
      ? JSON.parse(matchMetadataJson)
      : (matchMetadataJson || {});
  } catch {
    return {};
  }
}

export interface PricingSummary {
  quantity: number;
  quantityLabel: string;
  isAdjusted: boolean;
  rawMarketDisplay: string;
  marketDisplay: string;
  wasRawMarketRaw: string | undefined;
  printDisplay: string;
  total: number;
  totalDisplay: string;
}

export function getPricingSummary(item: any): PricingSummary {
  const qty = item.currentQuantity;
  const raw = item.currentRawMarketPrice;
  const adjusted = item.adjustedMarketPrice;
  const print = item.currentRoundedPrintPrice;
  // Only show adjusted price if it exists AND the item is not price-locked
  const isAdjusted = adjusted != null && !item.priceLocked;
  const rawFormatted = raw?.toFixed(2) ?? "—";
  const total = (item.effectivePrice || raw || 0) * qty;

  return {
    quantity: qty,
    quantityLabel: String(qty),
    isAdjusted,
    rawMarketDisplay: `$${rawFormatted}`,
    marketDisplay: `$${isAdjusted ? adjusted.toFixed(2) : rawFormatted}`,
    wasRawMarketRaw: raw?.toFixed(2),
    printDisplay: `$${print ?? "—"}`,
    total,
    totalDisplay: `$${total.toFixed(2)}`,
  };
}

export function buildEbaySearchUrl(item: any): string | null {
  const parts = [item.productName, item.condition]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  const query = parts.join(" ");
  if (!query) return null;
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}
